"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";
import { isGmailConfigured, sendEmailAs } from "@/lib/google/gmail";

// Chatter parent: exactly one of these FK fields is set per message.
export type ChatterParent = {
  leadId?: string;
  quoteId?: string;
  subscriptionId?: string;
  companyId?: string;
  trailerId?: string;
  projectId?: string;
};

const noteSchema = z.object({
  body: z.string().min(1, "Note cannot be empty"),
});

const emailSchema = z.object({
  to: z.string().email("Valid recipient email required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Message cannot be empty"),
});

/**
 * Send a chatter email through the signed-in user's Gmail (impersonated via
 * domain-wide delegation) and log it on the record. When Gmail isn't
 * configured the message is still recorded as a note so nothing is lost.
 */
export async function sendChatterEmail(
  parent: ChatterParent,
  revalidate: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = emailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { to, subject, body } = parsed.data;

  if (!isGmailConfigured()) {
    // Degrade honestly: keep the content on the record and say why.
    await prisma.message.create({
      data: {
        channel: "NOTE",
        subject,
        body: `[Email not sent — Google Workspace not connected]\nTo: ${to}\n\n${body}`,
        authorId: session.user.id,
        ...parent,
      },
    });
    revalidatePath(revalidate);
    return {
      ok: false,
      error:
        "Google Workspace isn't connected yet — saved as a note instead of sending.",
    };
  }

  // Reply within an existing Gmail thread on this record when there is one,
  // so the customer sees one conversation rather than disconnected mails.
  const previous = await prisma.message.findFirst({
    where: { ...parent, channel: "EMAIL", providerThreadId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { providerThreadId: true },
  });

  const sent = await sendEmailAs({
    senderEmail: session.user.email ?? "",
    senderName: session.user.name ?? "BIGVIEW",
    to,
    subject,
    html: `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${body
      .split("\n")
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("")}</div>`,
    threadId: previous?.providerThreadId ?? null,
  });

  if (!sent) {
    await prisma.message.create({
      data: {
        channel: "EMAIL",
        direction: "OUT",
        subject,
        body,
        toAddress: to,
        deliveryStatus: "FAILED",
        authorId: session.user.id,
        ...parent,
      },
    });
    revalidatePath(revalidate);
    return { ok: false, error: "Gmail rejected the send — logged as failed." };
  }

  await prisma.message.create({
    data: {
      channel: "EMAIL",
      direction: "OUT",
      subject,
      body,
      toAddress: to,
      fromAddress: sent.fromAddress,
      providerMessageId: sent.messageId,
      providerThreadId: sent.threadId,
      deliveryStatus: "SENT",
      authorId: session.user.id,
      ...parent,
    },
  });

  revalidatePath(revalidate);
  return { ok: true };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function addNote(
  parent: ChatterParent,
  revalidate: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  await prisma.message.create({
    data: {
      channel: "NOTE",
      body: parsed.data.body,
      authorId: session.user.id,
      ...parent,
    },
  });

  revalidatePath(revalidate);
  return { ok: true };
}
