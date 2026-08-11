"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "./company-actions";
import { isGmailConfigured, sendEmailAs } from "@/lib/google/gmail";
import { formatCurrency } from "@/lib/format";
import type { QuoteAcceptanceMethod } from "@prisma/client";

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

  const existing = await prisma.quote.findUnique({
    where: { id },
    include: {
      company: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
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

  const after = await prisma.quote.findUnique({
    where: { id },
    include: {
      company: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (after) {
    const changes: string[] = [];
    if (existing.company?.name !== after.company?.name)
      changes.push(`Company: ${existing.company?.name ?? "—"} → ${after.company?.name ?? "—"}`);
    const oldContact = existing.contact
      ? `${existing.contact.firstName} ${existing.contact.lastName}`
      : "—";
    const newContact = after.contact
      ? `${after.contact.firstName} ${after.contact.lastName}`
      : "—";
    if (oldContact !== newContact)
      changes.push(`Contact: ${oldContact} → ${newContact}`);
    if (existing.terms !== after.terms) changes.push("Terms updated");

    const oldTotal = existing.lineItems.reduce(
      (s, i) => s + i.quantity * Number(i.unitPrice),
      0
    );
    const newTotal = after.lineItems.reduce(
      (s, i) => s + i.quantity * Number(i.unitPrice),
      0
    );
    const oldCount = existing.lineItems.length;
    const newCount = after.lineItems.length;
    if (oldCount !== newCount)
      changes.push(`Line items: ${oldCount} → ${newCount}`);
    if (Math.abs(oldTotal - newTotal) > 0.001)
      changes.push(`Total: ${formatCurrency(oldTotal)} → ${formatCurrency(newTotal)}`);

    if (changes.length > 0) {
      await prisma.message.create({
        data: {
          channel: "SYSTEM",
          body: changes.join("\n"),
          authorId: session.user.id,
          quoteId: id,
        },
      });
    }
  }

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
    if (lead && ["UNQUALIFIED", "CONTACTED", "QUALIFIED"].includes(lead.stage)) {
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

const METHOD_LABEL: Record<QuoteAcceptanceMethod, string> = {
  ONLINE: "online",
  PHONE: "by phone",
  EMAIL: "by email",
  SIGNED_DOCUMENT: "on a signed document",
  IN_PERSON: "in person",
};

/* Record an acceptance that happened off-platform. Conversion to a subscription
   requires an ACCEPTED quote, and until now only the customer clicking the
   public link could produce one — so a PM who accepted over the phone left the
   deal unconvertible. Deliberately does NOT set acceptedIp: nobody clicked
   anything, and the chatter names the user who recorded it so this can never be
   mistaken for a customer signature. */
export async function recordQuoteAcceptance(
  quoteId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const name = String(formData.get("acceptedByName") ?? "").trim();
  if (!name)
    return { ok: false, error: "Who at the customer accepted it?" };

  const method = String(formData.get("acceptedVia") ?? "");
  const VALID: QuoteAcceptanceMethod[] = [
    "PHONE",
    "EMAIL",
    "SIGNED_DOCUMENT",
    "IN_PERSON",
  ];
  if (!VALID.includes(method as QuoteAcceptanceMethod)) {
    return { ok: false, error: "Pick how the customer accepted" };
  }
  const acceptedVia = method as QuoteAcceptanceMethod;

  const rawDate = String(formData.get("acceptedAt") ?? "").trim();
  const acceptedAt = rawDate ? new Date(rawDate) : new Date();
  if (Number.isNaN(acceptedAt.getTime()))
    return { ok: false, error: "Invalid acceptance date" };
  if (acceptedAt.getTime() > Date.now() + 86_400_000)
    return { ok: false, error: "Acceptance date can't be in the future" };

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, number: true, status: true, leadId: true },
  });
  if (!quote) return { ok: false, error: "Quote not found" };
  if (quote.status === "ACCEPTED") return { ok: true, id: quoteId };
  // EXPIRED is allowed: a quote lapsing while the customer thought about it is
  // exactly the case this exists for. DRAFT isn't — send it first.
  if (quote.status !== "SENT" && quote.status !== "EXPIRED") {
    return {
      ok: false,
      error: `A ${quote.status.toLowerCase()} quote can't be accepted — send it first.`,
    };
  }

  const note = String(formData.get("note") ?? "").trim();
  const body =
    `Marked accepted by ${session.user.name ?? "a team member"} — ` +
    `${name} confirmed ${METHOD_LABEL[acceptedVia]}` +
    (quote.status === "EXPIRED" ? " (quote had expired)" : "") +
    (note ? ` — "${note}"` : "");

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: "ACCEPTED",
        acceptedAt,
        acceptedByName: name,
        acceptedVia,
        acceptedByUserId: session.user.id,
      },
    }),
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body,
        authorId: session.user.id,
        quoteId,
      },
    }),
    // Same as an online acceptance: the customer said yes, so the lead is won.
    ...(quote.leadId
      ? [
          prisma.message.create({
            data: {
              channel: "SYSTEM",
              body: `Quote ${quote.number} — ${body.charAt(0).toLowerCase()}${body.slice(1)}`,
              authorId: session.user.id,
              leadId: quote.leadId,
            },
          }),
          prisma.lead.update({
            where: { id: quote.leadId },
            data: { stage: "WON", closedAt: acceptedAt, lostReason: null },
          }),
        ]
      : []),
  ]);

  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/quotes");
  if (quote.leadId) {
    revalidatePath("/leads");
    revalidatePath(`/leads/${quote.leadId}`);
  }
  revalidatePath("/");
  return { ok: true, id: quoteId };
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
        acceptedVia: "ONLINE",
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
          // The customer's signature is the win. Waiting for ops to convert
          // the quote made win rate a measure of fulfillment latency, and
          // double-counted the revenue as both pipeline and pending
          // subscription in the meantime.
          prisma.lead.update({
            where: { id: quote.leadId },
            data: { stage: "WON", closedAt: new Date(), lostReason: null },
          }),
        ]
      : []),
  ]);

  revalidatePath(`/quotes/${quote.id}`);
  revalidatePath("/quotes");
  if (quote.leadId) {
    revalidatePath("/leads");
    revalidatePath(`/leads/${quote.leadId}`);
  }
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
    /* Mirror it onto the lead. The lead deliberately stays at QUOTE_SENT — in
       this business a decline often means "not at that price", so the rep
       decides whether to re-quote. It surfaces on the stalled-quotes card, and
       that review is impossible if the decline isn't visible on the record. */
    ...(quote.leadId
      ? [
          prisma.message.create({
            data: {
              channel: "SYSTEM",
              body: `Quote ${quote.number} declined by the customer${
                reason ? ` — "${reason}"` : ""
              }`,
              leadId: quote.leadId,
            },
          }),
        ]
      : []),
  ]);

  revalidatePath(`/quotes/${quote.id}`);
  revalidatePath("/quotes");
  if (quote.leadId) {
    revalidatePath("/leads");
    revalidatePath(`/leads/${quote.leadId}`);
  }
  return { ok: true };
}
