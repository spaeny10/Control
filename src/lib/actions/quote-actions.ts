"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "./company-actions";

const lineItemSchema = z.object({
  kind: z.enum(["RECURRING_MONTHLY", "ONE_TIME"]),
  description: z.string().min(1, "Line item description required"),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  planProductId: z.string().optional().nullable(),
});

const quoteSchema = z.object({
  companyId: z.string().min(1, "Company is required"),
  contactId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  lineItems: z.array(lineItemSchema).min(1, "Add at least one line item"),
});

export type QuoteInput = z.infer<typeof quoteSchema>;

async function nextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.quote.count({
    where: { number: { startsWith: `Q-${year}-` } },
  });
  return `Q-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function createQuote(input: QuoteInput): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const d = parsed.data;

  const quote = await prisma.quote.create({
    data: {
      number: await nextQuoteNumber(),
      companyId: d.companyId,
      contactId: d.contactId || undefined,
      leadId: d.leadId || undefined,
      projectId: d.projectId || undefined,
      validUntil: d.validUntil ? new Date(d.validUntil) : undefined,
      terms: d.terms || undefined,
      lineItems: {
        create: d.lineItems.map((item, i) => ({
          kind: item.kind,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          planProductId: item.planProductId || undefined,
          sortOrder: i,
        })),
      },
    },
  });

  revalidatePath("/quotes");
  return { ok: true, id: quote.id };
}

export async function updateQuote(
  id: string,
  input: QuoteInput
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Quote not found" };
  if (existing.status !== "DRAFT" && existing.status !== "SENT") {
    return { ok: false, error: `Cannot edit a ${existing.status} quote` };
  }

  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const d = parsed.data;

  await prisma.$transaction([
    prisma.quoteLineItem.deleteMany({ where: { quoteId: id } }),
    prisma.quote.update({
      where: { id },
      data: {
        companyId: d.companyId,
        contactId: d.contactId || null,
        leadId: d.leadId || null,
        projectId: d.projectId || null,
        validUntil: d.validUntil ? new Date(d.validUntil) : null,
        terms: d.terms || null,
        lineItems: {
          create: d.lineItems.map((item, i) => ({
            kind: item.kind,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            planProductId: item.planProductId || undefined,
            sortOrder: i,
          })),
        },
      },
    }),
  ]);

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  return { ok: true, id };
}

// Marks the quote SENT and (Phase 6) emails the public link. Until SendGrid
// is configured the link is logged to chatter for manual sharing.
export async function sendQuote(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: { contact: true, company: true },
  });
  if (!quote) return { ok: false, error: "Quote not found" };
  if (quote.status !== "DRAFT" && quote.status !== "SENT") {
    return { ok: false, error: `Quote is already ${quote.status}` };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const publicUrl = `${baseUrl}/q/${quote.publicToken}`;

  // TODO Phase 6: send via SendGrid to quote.contact.email
  await prisma.$transaction([
    prisma.quote.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date() },
    }),
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: `Quote marked sent. Public link: ${publicUrl}`,
        authorId: session.user.id,
        quoteId: id,
      },
    }),
  ]);

  // Advance the linked lead to QUOTE_SENT if it's still earlier in the pipeline.
  if (quote.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: quote.leadId } });
    if (lead && ["NEW", "CONTACTED", "QUALIFIED"].includes(lead.stage)) {
      await prisma.lead.update({
        where: { id: quote.leadId },
        data: { stage: "QUOTE_SENT" },
      });
    }
  }

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  if (quote.leadId) revalidatePath(`/leads/${quote.leadId}`);
  return { ok: true };
}

// ---- Public actions (no auth — reached from /q/[token]) ----

export async function acceptQuote(
  token: string,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Please enter your name" };

  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
  });
  if (!quote) return { ok: false, error: "Quote not found" };
  if (quote.status === "ACCEPTED") return { ok: true };
  if (quote.status !== "SENT") {
    return { ok: false, error: "This quote is no longer open for acceptance" };
  }
  if (quote.validUntil && quote.validUntil < new Date()) {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "EXPIRED" },
    });
    return { ok: false, error: "This quote has expired — contact us to renew it" };
  }

  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0].trim() ??
    headerList.get("x-real-ip") ??
    null;

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedByName: name,
        acceptedIp: ip,
      },
    }),
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: `Quote accepted online by ${name}`,
        quoteId: quote.id,
      },
    }),
    ...(quote.leadId
      ? [
          prisma.message.create({
            data: {
              channel: "SYSTEM",
              body: `Quote ${quote.number} accepted by ${name}`,
              leadId: quote.leadId,
            },
          }),
        ]
      : []),
  ]);

  revalidatePath(`/quotes/${quote.id}`);
  revalidatePath("/quotes");
  return { ok: true };
}

export async function declineQuote(
  token: string,
  formData: FormData
): Promise<ActionResult> {
  const reason = String(formData.get("reason") ?? "").trim();

  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
  });
  if (!quote) return { ok: false, error: "Quote not found" };
  if (quote.status !== "SENT") {
    return { ok: false, error: "This quote is no longer open" };
  }

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quote.id },
      data: { status: "DECLINED", declinedAt: new Date() },
    }),
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: `Quote declined online${reason ? ` — "${reason}"` : ""}`,
        quoteId: quote.id,
      },
    }),
  ]);

  revalidatePath(`/quotes/${quote.id}`);
  revalidatePath("/quotes");
  return { ok: true };
}
