import { prisma } from "@/lib/prisma";

/* Email oversight queries shared by the dashboard alert card, the Admin inbox
   feed, and the rep drill-down.

   "Unanswered" means the newest message on an email thread came FROM the
   customer — i.e. somebody is waiting on us. This is the mechanism that
   covers vacations, departures, and plain dropped balls with one signal. */

export type UnansweredThread = {
  threadId: string;
  /** Rep who started the thread (owner of the conversation). */
  repId: string | null;
  repName: string | null;
  repActive: boolean;
  customer: string | null;
  subject: string | null;
  lastInboundAt: Date;
  daysWaiting: number;
  /** Link to the record the thread is filed against. */
  href: string | null;
  recordLabel: string | null;
};

function hrefFor(m: {
  leadId: string | null;
  quoteId: string | null;
  subscriptionId: string | null;
  companyId: string | null;
  projectId: string | null;
  trailerId: string | null;
}): string | null {
  if (m.leadId) return `/leads/${m.leadId}`;
  if (m.quoteId) return `/quotes/${m.quoteId}`;
  if (m.subscriptionId) return `/subscriptions/${m.subscriptionId}`;
  if (m.companyId) return `/companies/${m.companyId}`;
  if (m.projectId) return `/projects/${m.projectId}`;
  if (m.trailerId) return `/fleet/${m.trailerId}`;
  return null;
}

/**
 * Threads whose most recent message is inbound.
 *
 * @param repId when set, only threads started by that rep (a member sees
 *              only their own; an admin passes undefined to see everything).
 */
export async function getUnansweredThreads(
  repId?: string
): Promise<UnansweredThread[]> {
  // Latest inbound and latest outbound timestamp per thread. Two grouped
  // queries joined in memory — the providerThreadId index covers both.
  const [inbound, outbound] = await Promise.all([
    prisma.message.groupBy({
      by: ["providerThreadId"],
      where: {
        channel: "EMAIL",
        direction: "IN",
        providerThreadId: { not: null },
      },
      _max: { createdAt: true },
    }),
    prisma.message.groupBy({
      by: ["providerThreadId"],
      where: {
        channel: "EMAIL",
        direction: "OUT",
        providerThreadId: { not: null },
      },
      _max: { createdAt: true },
    }),
  ]);

  const lastOut = new Map<string, Date>();
  for (const row of outbound) {
    if (row.providerThreadId && row._max.createdAt) {
      lastOut.set(row.providerThreadId, row._max.createdAt);
    }
  }

  const waiting = inbound.filter((row) => {
    if (!row.providerThreadId || !row._max.createdAt) return false;
    const replied = lastOut.get(row.providerThreadId);
    // No outbound at all, or the customer spoke last.
    return !replied || row._max.createdAt > replied;
  });
  if (waiting.length === 0) return [];

  const threadIds = waiting
    .map((r) => r.providerThreadId)
    .filter((id): id is string => !!id);

  // The thread's first outbound message identifies the owning rep and record.
  const anchors = await prisma.message.findMany({
    where: {
      providerThreadId: { in: threadIds },
      direction: "OUT",
      channel: "EMAIL",
    },
    orderBy: { createdAt: "asc" },
    select: {
      providerThreadId: true,
      authorId: true,
      author: { select: { name: true, isActive: true } },
      leadId: true,
      quoteId: true,
      subscriptionId: true,
      companyId: true,
      projectId: true,
      trailerId: true,
      company: { select: { name: true } },
      lead: { select: { title: true } },
      subscription: { select: { company: { select: { name: true } } } },
    },
  });
  const anchorByThread = new Map<string, (typeof anchors)[number]>();
  for (const a of anchors) {
    if (a.providerThreadId && !anchorByThread.has(a.providerThreadId)) {
      anchorByThread.set(a.providerThreadId, a);
    }
  }

  // Newest inbound message per thread, for subject and sender.
  const latestInbound = await prisma.message.findMany({
    where: {
      providerThreadId: { in: threadIds },
      direction: "IN",
      channel: "EMAIL",
    },
    orderBy: { createdAt: "desc" },
    select: {
      providerThreadId: true,
      subject: true,
      fromAddress: true,
      createdAt: true,
    },
  });
  const inboundByThread = new Map<string, (typeof latestInbound)[number]>();
  for (const m of latestInbound) {
    if (m.providerThreadId && !inboundByThread.has(m.providerThreadId)) {
      inboundByThread.set(m.providerThreadId, m);
    }
  }

  const now = Date.now();
  const results: UnansweredThread[] = [];
  for (const threadId of threadIds) {
    const anchor = anchorByThread.get(threadId);
    const latest = inboundByThread.get(threadId);
    if (!latest) continue;
    // Scope to one rep when asked.
    if (repId && anchor?.authorId !== repId) continue;

    const customer =
      anchor?.company?.name ??
      anchor?.subscription?.company.name ??
      anchor?.lead?.title ??
      latest.fromAddress ??
      null;

    results.push({
      threadId,
      repId: anchor?.authorId ?? null,
      repName: anchor?.author?.name ?? null,
      repActive: anchor?.author?.isActive ?? true,
      customer,
      subject: latest.subject,
      lastInboundAt: latest.createdAt,
      daysWaiting: Math.floor(
        (now - latest.createdAt.getTime()) / 86_400_000
      ),
      href: anchor ? hrefFor(anchor) : null,
      recordLabel: customer,
    });
  }

  // Longest-waiting first — that's the triage order.
  return results.sort(
    (a, b) => a.lastInboundAt.getTime() - b.lastInboundAt.getTime()
  );
}

export type RepEmailMessage = {
  id: string;
  direction: "IN" | "OUT";
  subject: string | null;
  address: string | null;
  customer: string | null;
  href: string | null;
  createdAt: Date;
};

export type RepEmailStats = {
  sent: number;
  sentThisWeek: number;
  /** Customer replies on threads this rep started. */
  received: number;
  unanswered: UnansweredThread[];
  recent: RepEmailMessage[];
};

/**
 * Email activity for one rep: counts plus their most recent customer
 * correspondence. Inbound mail has no author (it came from the customer), so
 * "received" is scoped by the threads the rep started rather than by authorId.
 */
export async function getRepEmailStats(repId: string): Promise<RepEmailStats> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [sent, sentThisWeek, unanswered, threadRows] = await Promise.all([
    prisma.message.count({
      where: { channel: "EMAIL", direction: "OUT", authorId: repId },
    }),
    prisma.message.count({
      where: {
        channel: "EMAIL",
        direction: "OUT",
        authorId: repId,
        createdAt: { gte: weekAgo },
      },
    }),
    getUnansweredThreads(repId),
    prisma.message.groupBy({
      by: ["providerThreadId"],
      where: {
        channel: "EMAIL",
        direction: "OUT",
        authorId: repId,
        providerThreadId: { not: null },
      },
    }),
  ]);

  const threadIds = threadRows
    .map((r) => r.providerThreadId)
    .filter((id): id is string => !!id);

  // One rep's thread count stays in the hundreds at this scale, so an IN
  // clause is fine; revisit if a mailbox ever grows past a few thousand.
  const [received, recentRows] = await Promise.all([
    threadIds.length
      ? prisma.message.count({
          where: {
            channel: "EMAIL",
            direction: "IN",
            providerThreadId: { in: threadIds },
          },
        })
      : Promise.resolve(0),
    prisma.message.findMany({
      where: {
        channel: "EMAIL",
        OR: [
          { authorId: repId, direction: "OUT" },
          ...(threadIds.length
            ? [
                {
                  direction: "IN" as const,
                  providerThreadId: { in: threadIds },
                },
              ]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        direction: true,
        subject: true,
        fromAddress: true,
        toAddress: true,
        createdAt: true,
        leadId: true,
        quoteId: true,
        subscriptionId: true,
        companyId: true,
        projectId: true,
        trailerId: true,
        company: { select: { name: true } },
        lead: { select: { title: true } },
        subscription: { select: { company: { select: { name: true } } } },
      },
    }),
  ]);

  const recent: RepEmailMessage[] = recentRows.map((m) => ({
    id: m.id,
    direction: m.direction,
    subject: m.subject,
    address: m.direction === "IN" ? m.fromAddress : m.toAddress,
    customer:
      m.company?.name ??
      m.subscription?.company.name ??
      m.lead?.title ??
      null,
    href: hrefFor(m),
    createdAt: m.createdAt,
  }));

  return { sent, sentThisWeek, received, unanswered, recent };
}
