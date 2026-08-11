import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPubSubPush, decodeGmailNotification } from "@/lib/google/pubsub";
import { ingestGmailHistory, renewWatch } from "@/lib/google/gmail-ingest";

/* Gmail push endpoint (Pub/Sub → here).

   Status codes matter more than they do for the Stripe webhook: Pub/Sub treats
   any 2xx as an ACK and deletes the notification forever. Returning 200 on a
   transient failure — as the Stripe route deliberately does — would silently
   drop a customer's email. So:
     200  processed, or will never succeed (ack)
     401  failed verification (retry + investigate)
     429  another delivery holds the mailbox claim (retry with backoff)
     500  transient failure (retry, then dead-letter)                        */

const STALE_CLAIM_MS = 2 * 60 * 1000;
const RENEW_WHEN_WITHIN_MS = 48 * 60 * 60 * 1000;

export async function POST(req: Request) {
  // 1. Authenticate the caller before touching the body.
  const verified = await verifyPubSubPush(req);
  if (!verified.ok) {
    if (!verified.configured) {
      return NextResponse.json(
        { error: "Gmail push not configured" },
        { status: 503 }
      );
    }
    console.error(`[gmail-push] rejected: ${verified.reason}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Decode. Anything unparseable will never become parseable — ack it.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ received: true, ignored: "unparseable" });
  }
  const notification = decodeGmailNotification(body);
  if (!notification) {
    return NextResponse.json({ received: true, ignored: "no-notification" });
  }

  // 3. Allowlist: only mailboxes we were explicitly told to watch.
  //    notification.historyId is intentionally NOT used as the resume point —
  //    our stored watermark is the source of truth.
  const mailbox = await prisma.gmailSyncState.findUnique({
    where: { emailAddress: notification.emailAddress },
  });
  if (!mailbox || !mailbox.isActive) {
    return NextResponse.json({ received: true, ignored: "unknown-mailbox" });
  }

  // 4. Claim the mailbox so concurrent deliveries don't both walk history.
  const claimed = await prisma.gmailSyncState.updateMany({
    where: {
      id: mailbox.id,
      OR: [
        { syncLockedAt: null },
        { syncLockedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
      ],
    },
    data: { syncLockedAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Busy" }, { status: 429 });
  }

  try {
    const result = await ingestGmailHistory(mailbox);

    // Opportunistic renewal. The scheduled job is authoritative — this only
    // helps for busy mailboxes and can't fire during a quiet week.
    if (
      mailbox.watchExpiration &&
      mailbox.watchExpiration.getTime() - Date.now() < RENEW_WHEN_WITHIN_MS
    ) {
      await renewWatch(mailbox);
    }

    await prisma.gmailSyncState.update({
      where: { id: mailbox.id },
      data: { lastSyncedAt: new Date() },
    });

    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    console.error("[gmail-push] ingest failed", notification.emailAddress, err);
    await prisma.gmailSyncState.update({
      where: { id: mailbox.id },
      data: { lastError: String(err).slice(0, 500) },
    });
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  } finally {
    // Always release, even on failure, so a crash can't wedge the mailbox
    // for longer than the staleness window.
    await prisma.gmailSyncState.update({
      where: { id: mailbox.id },
      data: { syncLockedAt: null },
    });
  }
}
