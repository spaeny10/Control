import { prisma } from "@/lib/prisma";

/* Leads sitting at Quote sent with nothing live in front of the customer.

   A declined quote deliberately does NOT auto-close its lead — in this business
   "no" often means "not at that price", and the rep should decide. This surfaces
   those leads for that decision instead of letting them sit in the forecast
   forever.

   Derived rather than flagged: sending a newer quote creates a newer row, so the
   signal clears itself. A boolean column would be state to reset and state to
   leave stale. */

export type StalledQuoteLead = {
  leadId: string;
  title: string;
  company: string | null;
  estMrr: number | null;
  quoteNumber: string;
  reason: "declined" | "expired" | "lapsed";
  deadSince: Date;
  daysStalled: number;
  repName: string | null;
  repActive: boolean;
};

export async function getStalledQuoteLeads(
  repId?: string
): Promise<StalledQuoteLead[]> {
  const leads = await prisma.lead.findMany({
    where: {
      stage: "QUOTE_SENT",
      type: "NEW_PROJECT",
      ...(repId ? { ownerId: repId } : {}),
    },
    select: {
      id: true,
      title: true,
      estMrr: true,
      company: { select: { name: true } },
      owner: { select: { name: true, isActive: true } },
      quotes: {
        // Drafts aren't customer-facing, so a half-written re-quote must not
        // clear a signal the customer has never seen.
        where: { status: { not: "DRAFT" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          number: true,
          status: true,
          validUntil: true,
          declinedAt: true,
          sentAt: true,
          createdAt: true,
        },
      },
    },
  });

  const now = Date.now();
  const rows: StalledQuoteLead[] = [];

  for (const lead of leads) {
    const q = lead.quotes[0];
    if (!q) continue; // At QUOTE_SENT with no quote — a different problem.

    // Still live: accepted, or sent and not yet past its validity.
    const lapsed = !!q.validUntil && q.validUntil.getTime() < now;
    if (q.status === "ACCEPTED") continue;
    if (q.status === "SENT" && !lapsed) continue;

    const reason: StalledQuoteLead["reason"] =
      q.status === "DECLINED"
        ? "declined"
        : q.status === "EXPIRED"
          ? "expired"
          : // Status is still SENT but validity ran out. This is the common
            // case: nothing in the app sweeps quotes to EXPIRED, so without
            // this branch most real expiries would never surface.
            "lapsed";

    const deadSince =
      q.declinedAt ?? (lapsed && q.validUntil ? q.validUntil : q.createdAt);

    rows.push({
      leadId: lead.id,
      title: lead.title,
      company: lead.company?.name ?? null,
      estMrr: lead.estMrr ? Number(lead.estMrr) : null,
      quoteNumber: q.number,
      reason,
      deadSince,
      daysStalled: Math.floor(
        (now - deadSince.getTime()) / (1000 * 60 * 60 * 24)
      ),
      repName: lead.owner?.name ?? null,
      repActive: lead.owner?.isActive ?? true,
    });
  }

  // Longest-stalled first — that's the triage order.
  return rows.sort((a, b) => a.deadSince.getTime() - b.deadSince.getTime());
}
