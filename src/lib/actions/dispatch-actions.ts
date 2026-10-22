"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";
import type { JobStatus, JobType, Prisma } from "@prisma/client";
import { syncJobEvent, deleteJobEvent } from "@/lib/google/calendar";

const jobSchema = z.object({
  type: z.enum(["DELIVERY", "PICKUP", "SERVICE"]),
  scheduledFor: z.string().min(1, "Date/time is required"),
  driverId: z.string().optional(),
  subscriptionId: z.string().optional(),
  siteAddress: z.string().optional(),
  notes: z.string().optional(),
});

export async function createJob(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = jobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  // Default the site address from the linked subscription's project.
  let siteAddress = d.siteAddress || undefined;
  if (!siteAddress && d.subscriptionId) {
    const sub = await prisma.subscription.findUnique({
      where: { id: d.subscriptionId },
      include: { project: true },
    });
    if (sub?.project) {
      siteAddress =
        [
          sub.project.siteStreet,
          [sub.project.siteCity, sub.project.siteState]
            .filter(Boolean)
            .join(", "),
        ]
          .filter(Boolean)
          .join(", ") || undefined;
    }
  }

  /* The job's units default to everything it could act on: a delivery takes
     every unit still in the yard for that contract, a pickup or service visit
     every unit on site. The driver narrows it at completion for a partial run. */
  const trailerIds = d.subscriptionId
    ? await unitsForJob(d.subscriptionId, d.type)
    : [];

  const job = await prisma.dispatchJob.create({
    data: {
      type: d.type,
      scheduledFor: new Date(d.scheduledFor),
      driverId: d.driverId || undefined,
      subscriptionId: d.subscriptionId || undefined,
      siteAddress,
      notes: d.notes || undefined,
      trailerIds,
    },
  });

  if (d.subscriptionId) {
    await prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: `${d.type.charAt(0) + d.type.slice(1).toLowerCase()} scheduled for ${new Date(
          d.scheduledFor
        ).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        authorId: session.user.id,
        subscriptionId: d.subscriptionId,
      },
    });
  }

  // Push to the driver's Google Calendar. Failure-isolated inside — a
  // calendar problem must not undo a scheduled job.
  await syncJobEvent(job.id);

  revalidatePath("/dispatch");
  return { ok: true, id: job.id };
}

async function unitsForJob(subscriptionId: string, type: JobType) {
  const open = await prisma.trailerDeployment.findMany({
    where: {
      subscriptionId,
      returnedAt: null,
      deliveredAt: type === "DELIVERY" ? null : { not: null },
    },
    select: { trailerId: true },
  });
  return open.map((d) => d.trailerId);
}

/* Completing a job is what moves equipment. A delivery puts its units on site;
   a pickup brings them back to the yard for inspection. Billing is untouched
   either way — units can sit on site for weeks before activation, and billing
   can end before the truck arrives.

   trailerIds is the set the driver actually moved, which may be fewer than the
   job planned (a partial pickup, a unit that didn't fit on the truck). Anything
   left over stays where it was and shows up in the queue again. */
export async function completeJob(
  jobId: string,
  trailerIds: string[]
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const job = await prisma.dispatchJob.findUnique({
    where: { id: jobId },
    select: { id: true, type: true, status: true, subscriptionId: true },
  });
  if (!job) return { ok: false, error: "Job not found" };
  if (job.status === "DONE" || job.status === "CANCELED") {
    return { ok: false, error: `Job is already ${job.status.toLowerCase()}` };
  }

  const now = new Date();
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  let moved: { unitNumber: string; trailerId: string }[] = [];

  if (job.type !== "SERVICE" && trailerIds.length > 0) {
    if (!job.subscriptionId) {
      return { ok: false, error: "Job isn't linked to a subscription" };
    }
    const delivering = job.type === "DELIVERY";
    const deployments = await prisma.trailerDeployment.findMany({
      where: {
        subscriptionId: job.subscriptionId,
        trailerId: { in: trailerIds },
        returnedAt: null,
        deliveredAt: delivering ? null : { not: null },
      },
      select: { id: true, trailerId: true, trailer: { select: { unitNumber: true } } },
    });
    if (deployments.length !== trailerIds.length) {
      return {
        ok: false,
        error: delivering
          ? "Some of those units are already on site or no longer on this contract"
          : "Some of those units aren't on site for this contract",
      };
    }
    moved = deployments.map((d) => ({
      trailerId: d.trailerId,
      unitNumber: d.trailer.unitNumber,
    }));

    ops.push(
      prisma.trailerDeployment.updateMany({
        where: { id: { in: deployments.map((d) => d.id) } },
        data: delivering ? { deliveredAt: now } : { returnedAt: now },
      }),
      prisma.trailer.updateMany({
        where: { id: { in: trailerIds } },
        // Back from a site, a unit is checked before it can go out again.
        data: { status: delivering ? "DEPLOYED" : "INSPECTION" },
      }),
      ...moved.map((m) =>
        prisma.message.create({
          data: {
            channel: "SYSTEM",
            body: delivering
              ? "Delivered to site."
              : "Picked up from site — awaiting inspection.",
            authorId: session.user!.id,
            trailerId: m.trailerId,
          },
        })
      )
    );
  }

  ops.push(
    prisma.dispatchJob.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        completedAt: now,
        // Record what actually moved, not what was planned.
        ...(job.type !== "SERVICE" ? { trailerIds: moved.map((m) => m.trailerId) } : {}),
      },
    })
  );

  if (job.subscriptionId) {
    const units = moved.map((m) => m.unitNumber).join(", ");
    ops.push(
      prisma.message.create({
        data: {
          channel: "SYSTEM",
          body:
            job.type === "DELIVERY"
              ? units
                ? `Delivered to site: ${units}.`
                : "Delivery job closed with no units delivered."
              : job.type === "PICKUP"
                ? units
                  ? `Picked up from site: ${units} — awaiting inspection.`
                  : "Pickup job closed with no units collected."
                : "Service visit completed.",
          authorId: session.user.id,
          subscriptionId: job.subscriptionId,
        },
      })
    );
  }

  await prisma.$transaction(ops);

  /* Everything back in the yard while the contract still bills is almost
     always a missed End billing — say so where accounting will see it. */
  if (job.type === "PICKUP" && job.subscriptionId && moved.length > 0) {
    const sub = await prisma.subscription.findUnique({
      where: { id: job.subscriptionId },
      select: {
        status: true,
        _count: { select: { deployments: { where: { returnedAt: null } } } },
      },
    });
    if (
      sub &&
      (sub.status === "ACTIVE" || sub.status === "PAST_DUE") &&
      sub._count.deployments === 0
    ) {
      await prisma.message.create({
        data: {
          channel: "SYSTEM",
          body: "All units are back in the yard but billing is still running — end billing if the job is over.",
          subscriptionId: job.subscriptionId,
        },
      });
    }
  }

  await syncJobEvent(jobId);

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${jobId}`);
  revalidatePath("/fleet");
  revalidatePath("/");
  if (job.subscriptionId) revalidatePath(`/subscriptions/${job.subscriptionId}`);
  return { ok: true };
}

export async function setJobStatus(
  id: string,
  status: JobStatus
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  /* "Done" from the calendar card means the planned units all moved. The job
     page is where a driver records a partial run. */
  if (status === "DONE") {
    const job = await prisma.dispatchJob.findUnique({
      where: { id },
      select: { type: true, trailerIds: true, subscriptionId: true },
    });
    if (!job) return { ok: false, error: "Job not found" };
    const planned =
      job.trailerIds.length > 0 || !job.subscriptionId
        ? job.trailerIds
        : await unitsForJob(job.subscriptionId, job.type);
    return completeJob(id, job.type === "SERVICE" ? [] : planned);
  }

  /* Reopening a finished job would leave its units where completion put them
     while the job claims they haven't moved. Book a new job instead. */
  const current = await prisma.dispatchJob.findUnique({
    where: { id },
    select: { status: true },
  });
  if (current?.status === "DONE") {
    return { ok: false, error: "This job is complete — its units have already moved" };
  }

  await prisma.dispatchJob.update({
    where: { id },
    data: { status, completedAt: null },
  });

  // Cancelling removes the event; other transitions keep it in step.
  await syncJobEvent(id);

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${id}`);
  return { ok: true };
}

export async function deleteJob(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  // Remove the calendar event first — this is a hard delete, so afterwards
  // we'd have no way to find the event id.
  await deleteJobEvent(id);

  await prisma.dispatchJob.delete({ where: { id } });
  revalidatePath("/dispatch");
  return { ok: true };
}
