"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";
import type { JobStatus } from "@prisma/client";

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

  const job = await prisma.dispatchJob.create({
    data: {
      type: d.type,
      scheduledFor: new Date(d.scheduledFor),
      driverId: d.driverId || undefined,
      subscriptionId: d.subscriptionId || undefined,
      siteAddress,
      notes: d.notes || undefined,
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

  revalidatePath("/dispatch");
  return { ok: true, id: job.id };
}

export async function setJobStatus(
  id: string,
  status: JobStatus
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  await prisma.dispatchJob.update({
    where: { id },
    data: {
      status,
      completedAt: status === "DONE" ? new Date() : null,
    },
  });
  revalidatePath("/dispatch");
  return { ok: true };
}

export async function deleteJob(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  await prisma.dispatchJob.delete({ where: { id } });
  revalidatePath("/dispatch");
  return { ok: true };
}
