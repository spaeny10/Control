import { prisma } from "@/lib/prisma";
import { fetchMessage, listAddedMessageIds, watchMailbox } from "./gmail";

/* Turning a Gmail push notification into chatter messages.

   THE THREAD GATE is the whole privacy boundary: a message is only ingested
   if its Gmail threadId matches a thread this app itself sent on. Even though
   domain-wide delegation could read an entire mailbox, unrelated mail is
   never stored, and we never spend an API call fetching its body. */

/** Headers that mark automated mail we don't want cluttering the feed. */
function isAutomated(headers: { from: string; subject: string }) {
  const from = headers.from.toLowerCase();
  return (
    from.includes("mailer-daemon@") ||
    from.includes("postmaster@") ||
    from.startsWith("noreply") ||
    from.includes("<noreply") ||
    from.includes("no-reply")
  );
}

/** Strip the quoted history so chatter shows just the new reply. */
function stripQuotedReply(body: string) {
  const lines = body.split(/\r?\n/);
  const cut = lines.findIndex(
    (line) =>
      /^\s*On .+ wrote:\s*$/.test(line) ||
      /^\s*-{2,}\s*Original Message\s*-{2,}/i.test(line) ||
      /^\s*_{10,}\s*$/.test(line) ||
      /^\s*From:\s.+/.test(line)
  );
  const kept = (cut > 0 ? lines.slice(0, cut) : lines)
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .trim();
  return kept || body.trim();
}

function parseAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

/** Advance a historyId watermark, never backwards. */
function maxHistoryId(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  try {
    return BigInt(a) >= BigInt(b) ? a : b;
  } catch {
    return b;
  }
}

export type IngestResult = { imported: number; skipped: number };

export async function ingestGmailHistory(mailbox: {
  id: string;
  emailAddress: string;
  lastHistoryId: string | null;
}): Promise<IngestResult> {
  // A brand-new mailbox has no watermark: start from "now" rather than
  // importing the mailbox's entire history.
  if (!mailbox.lastHistoryId) {
    const watch = await watchMailbox(mailbox.emailAddress);
    await prisma.gmailSyncState.update({
      where: { id: mailbox.id },
      data: {
        lastHistoryId: watch?.historyId ?? null,
        watchExpiration: watch?.expiration ?? null,
      },
    });
    return { imported: 0, skipped: 0 };
  }

  // Always resume from OUR watermark, not the notification's historyId — a
  // previously failed push would otherwise be skipped permanently.
  const history = await listAddedMessageIds(
    mailbox.emailAddress,
    mailbox.lastHistoryId
  );

  if (!history) {
    // Most likely the watermark aged out of Gmail's ~1 week history window.
    // Skip forward rather than resyncing an entire mailbox, and record the
    // gap so it's visible instead of silent.
    const watch = await watchMailbox(mailbox.emailAddress);
    await prisma.gmailSyncState.update({
      where: { id: mailbox.id },
      data: {
        lastHistoryId: watch?.historyId ?? mailbox.lastHistoryId,
        watchExpiration: watch?.expiration ?? undefined,
        lastError:
          "Gmail history expired; cursor advanced to now. Replies during the gap were not imported.",
      },
    });
    return { imported: 0, skipped: 0 };
  }

  let imported = 0;
  let skipped = 0;

  for (const messageId of history.ids) {
    // Dedupe before spending an API call (Pub/Sub is at-least-once).
    const seen = await prisma.message.findFirst({
      where: { providerMessageId: messageId },
      select: { id: true },
    });
    if (seen) {
      skipped++;
      continue;
    }

    const full = await fetchMessage(mailbox.emailAddress, messageId);
    if (!full) {
      skipped++;
      continue;
    }

    // THREAD GATE: only threads this app sent on.
    const anchor = await prisma.message.findFirst({
      where: {
        providerThreadId: full.threadId,
        direction: "OUT",
        channel: "EMAIL",
      },
      orderBy: { createdAt: "asc" },
      select: {
        leadId: true,
        quoteId: true,
        subscriptionId: true,
        companyId: true,
        trailerId: true,
        projectId: true,
      },
    });
    if (!anchor) {
      skipped++;
      continue;
    }

    const fromAddress = parseAddress(full.from);
    // Don't re-ingest our own sends echoing back.
    if (fromAddress === mailbox.emailAddress.toLowerCase()) {
      skipped++;
      continue;
    }
    if (isAutomated({ from: full.from, subject: full.subject })) {
      skipped++;
      continue;
    }

    try {
      await prisma.message.create({
        data: {
          channel: "EMAIL",
          direction: "IN",
          subject: full.subject || null,
          // Stored as plain text; the UI escapes it (never dangerouslySetInnerHTML).
          body: stripQuotedReply(full.body) || "(no text content)",
          fromAddress,
          toAddress: parseAddress(full.to),
          providerMessageId: full.id,
          providerThreadId: full.threadId,
          deliveryStatus: "DELIVERED",
          authorId: null, // inbound from an external party
          ...anchor, // inherits the record this thread belongs to
        },
      });
      imported++;
    } catch (err) {
      // Unique violation on providerMessageId = another delivery won the race.
      if ((err as { code?: string })?.code === "P2002") {
        skipped++;
      } else {
        throw err;
      }
    }
  }

  await prisma.gmailSyncState.update({
    where: { id: mailbox.id },
    data: {
      lastHistoryId:
        maxHistoryId(mailbox.lastHistoryId, history.latestHistoryId) ??
        mailbox.lastHistoryId,
      lastError: null,
    },
  });

  return { imported, skipped };
}

/**
 * Re-arm a mailbox's Gmail watch. Watches expire after ~7 days and Gmail then
 * stops publishing *silently*, so this must run on a schedule.
 */
export async function renewWatch(mailbox: {
  id: string;
  emailAddress: string;
}): Promise<boolean> {
  const watch = await watchMailbox(mailbox.emailAddress);
  if (!watch) return false;
  await prisma.gmailSyncState.update({
    where: { id: mailbox.id },
    data: {
      watchExpiration: watch.expiration,
      // Only seed the watermark if we don't have one yet.
      ...(watch.historyId ? {} : {}),
    },
  });
  return true;
}
