import { NextResponse } from "next/server";
import { runBilling, getDueInvoiceQueue } from "@/lib/billing";

/* Scheduled billing run.

   Lives under /api/webhooks/ deliberately: src/proxy.ts already excludes that
   prefix from auth, so a route under /api/cron/ would be redirected to /login
   and fail silently — the same trap the Gmail watch renewal documents.

   Authenticated by a shared secret rather than an OIDC token, because this is
   hit by a plain scheduler (Railway cron or similar) and not by Pub/Sub. With no
   secret configured it refuses rather than running open: an endpoint that raises
   invoices must never be publicly callable.

   GET reports what is due without raising anything, which is the safe way to
   check the schedule by hand. */

function authorize(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.BILLING_RUN_SECRET;
  if (!secret) {
    return { ok: false, status: 503, error: "BILLING_RUN_SECRET not configured" };
  }
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.headers.get("x-billing-secret");
  if (provided !== secret) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) {
    if (auth.status === 401) console.error("[billing-run] rejected: bad secret");
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const started = Date.now();
  const { due, results } = await runBilling();
  const raised = results.filter((r) => r.outcome.startsWith("raised")).length;
  const failed = results.length - raised;

  // Logged so a scheduler's own history is a usable audit trail.
  console.log(
    `[billing-run] due=${due} raised=${raised} skipped_or_failed=${failed} in ${Date.now() - started}ms`
  );
  for (const r of results) {
    if (!r.outcome.startsWith("raised")) {
      console.warn(`[billing-run] ${r.company}: ${r.outcome}`);
    }
  }

  return NextResponse.json({ due, raised, failed, results });
}

/** Dry run — what would be raised, without raising it. */
export async function GET(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const queue = await getDueInvoiceQueue();
  return NextResponse.json({ due: queue.length, queue });
}
