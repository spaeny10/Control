"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";

const trailerSchema = z.object({
  unitNumber: z.string().min(1, "Unit number is required"),
  model: z.string().optional(),
  notes: z.string().optional(),
});

export async function createTrailer(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = trailerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const existing = await prisma.trailer.findUnique({
    where: { unitNumber: parsed.data.unitNumber },
  });
  if (existing) {
    return { ok: false, error: `Unit ${parsed.data.unitNumber} already exists` };
  }

  const trailer = await prisma.trailer.create({ data: parsed.data });
  revalidatePath("/fleet");
  return { ok: true, id: trailer.id };
}

export async function updateTrailer(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = trailerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  await prisma.trailer.update({ where: { id }, data: parsed.data });
  revalidatePath("/fleet");
  revalidatePath(`/fleet/${id}`);
  return { ok: true, id };
}

// Manual status changes cover the non-deployment lifecycle. DEPLOYED is
// set/cleared by deployment flows, never by hand.
export async function setTrailerStatus(
  id: string,
  status: "AVAILABLE" | "MAINTENANCE" | "RETIRED"
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const trailer = await prisma.trailer.findUnique({
    where: { id },
    include: { deployments: { where: { returnedAt: null } } },
  });
  if (!trailer) return { ok: false, error: "Trailer not found" };
  if (trailer.deployments.length > 0) {
    return {
      ok: false,
      error: "Trailer is deployed — return it from its site first",
    };
  }

  await prisma.trailer.update({ where: { id }, data: { status } });
  await prisma.message.create({
    data: {
      channel: "SYSTEM",
      body: `Status changed to ${status}`,
      authorId: session.user.id,
      trailerId: id,
    },
  });

  revalidatePath("/fleet");
  revalidatePath(`/fleet/${id}`);
  return { ok: true };
}

const maintenanceSchema = z.object({
  description: z.string().min(1, "Description is required"),
  date: z.string().optional(),
  cost: z.string().optional(),
});

export async function addMaintenanceLog(
  trailerId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = maintenanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  await prisma.maintenanceLog.create({
    data: {
      trailerId,
      description: parsed.data.description,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
      cost: parsed.data.cost ? parseFloat(parsed.data.cost) : undefined,
    },
  });

  revalidatePath(`/fleet/${trailerId}`);
  return { ok: true };
}

// Return a trailer from its current deployment. If it was the last unit on
// the subscription this does NOT end the subscription — ending is a billing
// decision made on the subscription page.
export async function returnTrailer(
  deploymentId: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const deployment = await prisma.trailerDeployment.findUnique({
    where: { id: deploymentId },
    include: { trailer: true },
  });
  if (!deployment) return { ok: false, error: "Deployment not found" };
  if (deployment.returnedAt)
    return { ok: false, error: "Already returned" };

  await prisma.$transaction([
    prisma.trailerDeployment.update({
      where: { id: deploymentId },
      data: { returnedAt: new Date() },
    }),
    prisma.trailer.update({
      where: { id: deployment.trailerId },
      data: { status: "AVAILABLE" },
    }),
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: `Unit ${deployment.trailer.unitNumber} returned from site`,
        authorId: session.user.id,
        trailerId: deployment.trailerId,
      },
    }),
  ]);

  revalidatePath("/fleet");
  revalidatePath(`/fleet/${deployment.trailerId}`);
  revalidatePath(`/subscriptions/${deployment.subscriptionId}`);
  return { ok: true };
}
