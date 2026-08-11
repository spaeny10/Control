"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logChanges } from "@/lib/audit";
import { formatCurrency, formatDate } from "@/lib/format";
import type { LeadStage } from "@prisma/client";
import type { ActionResult } from "./company-actions";

const leadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(["NEW_COMPANY", "NEW_PROJECT"]),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  projectId: z.string().optional(),
  ownerId: z.string().optional(),
  // Set when a project lead is spawned from an organization lead.
  sourceLeadId: z.string().optional(),
  estMrr: z.string().optional(),
  estMonths: z.string().optional(),
  estValue: z.string().optional(),
  source: z.string().optional(),
  expectedClose: z.string().optional(),
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

type LeadInput = z.infer<typeof leadSchema>;

/* Track shape, enforced here rather than in the Zod schema because the
   retype rules need the row as it exists now, which a refinement can't see.
   Organization leads carry no economics and never reach QUOTE_SENT — an
   organization isn't a job, so there's nothing to quote. */
function validateTrack(
  d: LeadInput,
  before?: {
    type: "NEW_COMPANY" | "NEW_PROJECT";
    stage: LeadStage;
    quoteCount: number;
    quoteNumber: string | null;
  }
): string | null {
  const values = deriveValues(d);
  const hasEconomics =
    values.estMrr !== null ||
    values.estMonths !== null ||
    values.estValue !== null;

  if (d.type === "NEW_COMPANY" && hasEconomics) {
    return "Organization leads don't carry estimated revenue — the job that earns it is a separate project lead.";
  }

  if (!before) return null;

  // Retyping a project lead down to an organization lead throws away money.
  // Allowed while it's only an estimate; blocked once a quote exists, because
  // that's an external document the customer may already be holding.
  if (before.type === "NEW_PROJECT" && d.type === "NEW_COMPANY") {
    if (before.quoteCount > 0) {
      return `This lead has quote ${before.quoteNumber ?? "on file"}. Organization leads don't carry quotes — void the quote first, or create a separate organization lead for the vendor conversation.`;
    }
    if (before.stage === "QUOTE_SENT" || before.stage === "WON") {
      return `A lead at ${before.stage === "WON" ? "Won" : "Quote sent"} has committed revenue behind it and can't become an organization lead. Create a separate organization lead instead.`;
    }
  }

  return null;
}

export async function createLead(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const d = parsed.data;

  const shapeError = validateTrack(d);
  if (shapeError) return { ok: false, error: shapeError };

  let projectId = d.projectId || undefined;

  // A project lead is a specific job, so it needs a Project record — without
  // one there's nothing for trailers to deploy onto.
  if (d.type === "NEW_PROJECT") {
    if (!d.companyId)
      return { ok: false, error: "Project leads need an existing company" };
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
      sourceLeadId: d.sourceLeadId || undefined,
      estMrr: values.estMrr ?? undefined,
      estMonths: values.estMonths ?? undefined,
      estValue: values.estValue ?? undefined,
      source: d.source || undefined,
      expectedClose: d.expectedClose ? new Date(d.expectedClose) : undefined,
      // Honour an explicitly chosen owner; fall back to the creator.
      ownerId: d.ownerId || session.user.id,
    },
  });

  // Provenance is worth seeing from both ends of the relationship.
  if (lead.sourceLeadId) {
    await prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: `Spawned project lead: ${lead.title}`,
        authorId: session.user.id,
        leadId: lead.sourceLeadId,
      },
    });
    revalidatePath(`/leads/${lead.sourceLeadId}`);
  }

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

  const before = await prisma.lead.findUnique({
    where: { id },
    include: {
      company: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
      owner: { select: { name: true } },
      quotes: { select: { number: true }, take: 1 },
      _count: { select: { quotes: true } },
    },
  });
  if (!before) return { ok: false, error: "Lead not found" };

  const shapeError = validateTrack(d, {
    type: before.type,
    stage: before.stage,
    quoteCount: before._count.quotes,
    quoteNumber: before.quotes[0]?.number ?? null,
  });
  if (shapeError) return { ok: false, error: shapeError };

  const values = deriveValues(d);
  const after = await prisma.lead.update({
    where: { id },
    data: {
      title: d.title,
      type: d.type,
      companyId: d.companyId || null,
      contactId: d.contactId || null,
      // Absent means "leave alone", not "unlink". The edit dialog has no
      // project picker, so writing `d.projectId || null` unconditionally would
      // silently detach the Project on every single edit.
      ...(d.projectId !== undefined ? { projectId: d.projectId || null } : {}),
      ownerId: d.ownerId || null,
      estMrr: values.estMrr,
      estMonths: values.estMonths,
      estValue: values.estValue,
      source: d.source || null,
      expectedClose: d.expectedClose ? new Date(d.expectedClose) : null,
    },
    include: {
      company: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
      owner: { select: { name: true } },
    },
  });

  await logChanges({
    parent: { leadId: id },
    authorId: session.user.id,
    before: {
      title: before.title,
      type: before.type,
      company: before.company?.name ?? null,
      contact: before.contact
        ? `${before.contact.firstName} ${before.contact.lastName}`
        : null,
      owner: before.owner?.name ?? null,
      estMrr: before.estMrr ? Number(before.estMrr) : null,
      estMonths: before.estMonths,
      estValue: before.estValue ? Number(before.estValue) : null,
      source: before.source,
      expectedClose: before.expectedClose,
    },
    after: {
      title: after.title,
      type: after.type,
      company: after.company?.name ?? null,
      contact: after.contact
        ? `${after.contact.firstName} ${after.contact.lastName}`
        : null,
      owner: after.owner?.name ?? null,
      estMrr: after.estMrr ? Number(after.estMrr) : null,
      estMonths: after.estMonths,
      estValue: after.estValue ? Number(after.estValue) : null,
      source: after.source,
      expectedClose: after.expectedClose,
    },
    fields: {
      title: { label: "Title" },
      type: {
        label: "Type",
        format: (v) =>
          v === "NEW_COMPANY" ? "New company" : v === "NEW_PROJECT" ? "New project" : "—",
      },
      company: { label: "Company" },
      contact: { label: "Contact" },
      owner: { label: "Owner" },
      estMrr: {
        label: "Est. MRR",
        format: (v) => (v != null ? formatCurrency(v as number) + "/mo" : "—"),
      },
      estMonths: {
        label: "Est. months",
        format: (v) => (v != null ? `${v} months` : "—"),
      },
      estValue: {
        label: "Total value",
        format: (v) => (v != null ? formatCurrency(v as number) : "—"),
      },
      source: { label: "Source" },
      expectedClose: {
        label: "Expected close",
        format: (v) => formatDate(v as Date | null),
      },
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

  // Defence in depth: the organization board hides the column, but the drag
  // handler and this action are both reachable independently of that UI.
  if (stage === "QUOTE_SENT") {
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: { type: true },
    });
    if (lead?.type === "NEW_COMPANY") {
      return {
        ok: false,
        error:
          "Organization leads can't reach Quote sent — you quote a job, not a company. Spawn a project lead instead.",
      };
    }
  }

  await prisma.lead.update({
    where: { id },
    data: {
      stage,
      // Stamp the close so win rate can be windowed; clear it on reopen.
      closedAt: stage === "WON" || stage === "LOST" ? new Date() : null,
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
