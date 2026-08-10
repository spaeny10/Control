"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { LeadStage } from "@prisma/client";
import type { ActionResult } from "./company-actions";

const leadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(["NEW_COMPANY", "NEW_PROJECT"]),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  projectId: z.string().optional(),
  estMrr: z.string().optional(),
  estMonths: z.string().optional(),
  estValue: z.string().optional(),
  source: z.string().optional(),
  expectedClose: z.string().optional(),
  // For NEW_PROJECT leads: create the Project record inline
  newProjectName: z.string().optional(),
});

// Total contract value defaults to MRR x months when not entered explicitly.
function deriveValues(d: {
  estMrr?: string;
  estMonths?: string;
  estValue?: string;
}) {
  const mrr = d.estMrr ? parseFloat(d.estMrr) : null;
  const months = d.estMonths ? parseInt(d.estMonths) : null;
  const explicitTotal = d.estValue ? parseFloat(d.estValue) : null;
  const total =
    explicitTotal ??
    (mrr !== null && months !== null
      ? Math.round(mrr * months * 100) / 100
      : null);
  return {
    estMrr: mrr !== null && !isNaN(mrr) ? mrr : null,
    estMonths: months !== null && !isNaN(months) ? months : null,
    estValue: total !== null && !isNaN(total) ? total : null,
  };
}

export async function createLead(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const d = parsed.data;

  let projectId = d.projectId || undefined;

  // A NEW_PROJECT lead is a new job at an existing customer — create the
  // Project record alongside the lead so the company's history accrues.
  if (d.type === "NEW_PROJECT") {
    if (!d.companyId)
      return { ok: false, error: "New Project leads need an existing company" };
    if (!projectId) {
      if (!d.newProjectName)
        return { ok: false, error: "Project name is required" };
      const project = await prisma.project.create({
        data: {
          name: d.newProjectName,
          companyId: d.companyId,
          status: "UPCOMING",
        },
      });
      projectId = project.id;
    }
  }

  const values = deriveValues(d);
  const lead = await prisma.lead.create({
    data: {
      title: d.title,
      type: d.type,
      companyId: d.companyId || undefined,
      contactId: d.contactId || undefined,
      projectId,
      estMrr: values.estMrr ?? undefined,
      estMonths: values.estMonths ?? undefined,
      estValue: values.estValue ?? undefined,
      source: d.source || undefined,
      expectedClose: d.expectedClose ? new Date(d.expectedClose) : undefined,
      ownerId: session.user.id,
    },
  });

  revalidatePath("/leads");
  return { ok: true, id: lead.id };
}

export async function updateLead(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const d = parsed.data;

  const values = deriveValues(d);
  await prisma.lead.update({
    where: { id },
    data: {
      title: d.title,
      type: d.type,
      companyId: d.companyId || null,
      contactId: d.contactId || null,
      projectId: d.projectId || null,
      estMrr: values.estMrr,
      estMonths: values.estMonths,
      estValue: values.estValue,
      source: d.source || null,
      expectedClose: d.expectedClose ? new Date(d.expectedClose) : null,
    },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return { ok: true, id };
}

export async function setLeadStage(
  id: string,
  stage: LeadStage,
  lostReason?: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  await prisma.lead.update({
    where: { id },
    data: {
      stage,
      lostReason: stage === "LOST" ? lostReason || "Not specified" : null,
    },
  });

  // Log the stage change on the lead's chatter timeline.
  await prisma.message.create({
    data: {
      channel: "SYSTEM",
      body: `Stage changed to ${stage.replace("_", " ")}${
        stage === "LOST" && lostReason ? ` — ${lostReason}` : ""
      }`,
      authorId: session.user.id,
      leadId: id,
    },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return { ok: true };
}
