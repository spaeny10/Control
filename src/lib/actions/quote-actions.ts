"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "./company-actions";
import { isGmailConfigured, sendEmailAs } from "@/lib/google/gmail";

const lineItemSchema = z.object({
  cycle: z.enum(["ONE_TIME", "DAILY", "WEEKLY", "EVERY_28_DAYS", "MONTHLY"]),
  description: z.string().min(1, "Line item description required"),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  planProductId: z.string().optional().nullable(),
});

const quoteSchema = z
  .object({
    companyId: z.string().min(1, "Company is required"),
    contactId: z.string().optional().nullable(),
    leadId: z.string().optional().nullable(),
    projectId: z.string().optional().nullable(),
    validUntil: z.string().optional().nullable(),
    terms: z.string().optional().nullable(),
    lineItems: z.array(lineItemSchema).min(1, "Add at least one line item"),
  })
  .refine(
    (q) => {
      // One billing cadence per subscription: recurring lines must share a cycle.
      const cycles = new Set(
        q.lineItems.filter((i) => i.cycle !== "ONE_TIME").map((i) => i.cycle)
      );
      return cycles.size <= 1;
    },
    {
      message:
        "All recurring line items must use the same billing cycle (one-time charges can mix freely)",
    }
  );

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
          cycle: item.cycle,
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
            cycle: item.cycle,
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

function quoteEmailHtml(opts: {
  contactName: string | null;
  companyName: string;
  quoteNumber: string;
  publicUrl: string;
  senderName: string;
}) {
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#25282f">
  <p>${opts.contactName ? `Hi ${opts.contactName},` : "Hello,"}</p>
  <p>Your BIGVIEW security trailer quote <strong>${opts.quoteNumber}</strong> for ${opts.companyName} is ready to review.</p>
  <p style="margin:24px 0">
    <a href="${opts.publicUrl}" style="background:#2a78d6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">Review &amp; accept your quote</a>
  </p>
  <p style="color:#52514e;font-size:13px">You can accept it right from that page — no account needed. Reply to this email with any questions.</p>
  <p style="margin-top:24px">${opts.senderName}<br><span style="color:#52514e">BIGVIEW Security Trailers</span></p>
</div>`;
}

// Marks the quote SENT and emails the public accept link from the sender's
// Workspace mailbox. Falls back to logging the link on the record when Google
// isn't connected, so the quote can still be shared manually.
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

  const recipient = quote.contact?.email ?? null;
  const contactName = quote.contact?.firstName ?? null;

  // Try the real email first so its outcome can be recorded accurately.
  const sent =
    isGmailConfigured() && recipient
      ? await sendEmailAs({
          senderEmail: session.user.email ?? "",
          senderName: session.user.name ?? "BIGVIEW",
          to: recipient,
          subject: `Your BIGVIEW quote ${quote.number} — ${quote.company.name}`,
          html: quoteEmailHtml({
            contactName,
            companyName: quote.company.name,
            quoteNumber: quote.number,
            publicUrl,
            senderName: session.user.name ?? "BIGVIEW",
          }),
        })
      : null;

  await prisma.$transaction([
    prisma.quote.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date() },
    }),
    sent
      ? prisma.message.create({
          data: {
            channel: "EMAIL",
            direction: "OUT",
            subject: `Your BIGVIEW quote ${quote.number}`,
            body: `Quote ${quote.number} emailed to ${recipient}.\n\n${publicUrl}`,
            toAddress: recipient,
            fromAddress: sent.fromAddress,
            providerMessageId: sent.messageId,
            providerThreadId: sent.threadId,
            deliveryStatus: "SENT",
            authorId: session.user.id,
            quoteId: id,
          },
        })
      : prisma.message.create({
          data: {
            channel: "SYSTEM",
            body: !recipient
              ? `Quote marked sent, but no contact email is on file — share this link manually: ${publicUrl}`
              : !isGmailConfigured()
                ? `Quote marked sent. Google Workspace isn't connected, so share this link manually: ${publicUrl}`
                : `Quote marked sent, but the email failed to send — share this link manually: ${publicUrl}`,
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

  // Report honestly: the quote IS sent either way, but say so when the email
  // didn't actually go out so nobody assumes the customer has it.
  if (!sent) {
    return {
      ok: true,
      error: !recipient
        ? "Marked sent — no contact email on file, so share the link manually."
        : !isGmailConfigured()
          ? "Marked sent — Google Workspace isn't connected, so share the link manually."
          : "Marked sent, but the email failed — share the link manually.",
    };
  }
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
