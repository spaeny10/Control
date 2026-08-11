import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPubSubPush } from "@/lib/google/pubsub";
import { renewWatch } from "@/lib/google/gmail-ingest";

/* Scheduled watch renewal.

   Gmail watches expire after ~7 days and Gmail then stops publishing with NO
   error of any kind — inbound email simply goes quiet. This endpoint is meant
   to be hit daily by Google Cloud Scheduler using an OIDC token, which is why
   it verifies with the same helper as the push endpoint.

   It lives under /api/webhooks/ deliberately: src/proxy.ts already excludes
   that prefix from auth. A route under /api/cron/ would be redirected to
   /login and fail silently. */

export async function POST(req: Request) {
  const verified = await verifyPubSubPush(req);
  if (!verified.ok) {
    if (!verified.configured) {
      return NextResponse.json(
        { error: "Gmail push not configured" },
        { status: 503 }
      );
    }
    console.error(`[gmail-renew] rejected: ${verified.reason}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mailboxes = await prisma.gmailSyncState.findMany({
    where: { isActive: true },
  });

  const results: { mailbox: string; renewed: boolean }[] = [];
  let failures = 0;
  for (const mailbox of mailboxes) {
    const renewed = await renewWatch(mailbox);
    if (!renewed) failures++;
    results.push({ mailbox: mailbox.emailAddress, renewed });
  }

  // Surface partial failure so the scheduler retries and the alert fires,
  // rather than reporting success while a watch quietly lapses.
  const status = failures > 0 ? 500 : 200;
  return NextResponse.json({ renewed: results, failures }, { status });
}
