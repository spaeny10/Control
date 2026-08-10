import { prisma } from "@/lib/prisma";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  addDays,
  format,
} from "date-fns";

export type MonthPoint = { month: string; mrr: number };
export type MovementPoint = {
  month: string;
  newMrr: number;
  rollOff: number; // negative — PROJECT_COMPLETED (expected, not churn)
  churn: number; // negative — everything else
};
export type LeadsPoint = { month: string; newCompany: number; newProject: number };

// Pass a repId to scope every figure to one salesperson: subscriptions by
// attribution, leads by owner, invoices/projects through their subscriptions.
export async function getDashboardData(
  months: number = 6,
  repId?: string
) {
  const now = new Date();
  const window = Math.min(36, Math.max(2, months));
  const subScope = repId ? { salespersonId: repId } : {};
  const leadScope = repId ? { ownerId: repId } : {};

  const [
    activeSubs,
    endedSubs,
    trailers,
    repDeployedUnits,
    openLeads,
    wonCount,
    lostCount,
    overdueInvoices,
    upcomingCompletions,
    leadsInWindow,
  ] = await Promise.all([
    prisma.subscription.findMany({
      where: { ...subScope, status: { in: ["ACTIVE", "PAST_DUE", "PAUSED"] } },
      select: { mrr: true, startDate: true },
    }),
    prisma.subscription.findMany({
      where: { ...subScope, status: "ENDED" },
      select: { mrr: true, startDate: true, endedAt: true, endReason: true },
    }),
    prisma.trailer.findMany({ select: { status: true } }),
    // Units currently on this rep's sites (fleet-wide utilization isn't
    // meaningful per rep, so the tile switches to a count when filtered).
    repId
      ? prisma.trailerDeployment.count({
          where: {
            returnedAt: null,
            subscription: { salespersonId: repId },
          },
        })
      : Promise.resolve(0),
    prisma.lead.findMany({
      where: { ...leadScope, stage: { notIn: ["WON", "LOST"] } },
      select: { estValue: true, estMrr: true },
    }),
    prisma.lead.count({ where: { ...leadScope, stage: "WON" } }),
    prisma.lead.count({ where: { ...leadScope, stage: "LOST" } }),
    prisma.invoice.aggregate({
      where: {
        status: "OPEN",
        dueDate: { lt: now },
        ...(repId ? { subscription: { salespersonId: repId } } : {}),
      },
      _sum: { amountDue: true, amountPaid: true },
      _count: true,
    }),
    prisma.project.findMany({
      where: {
        status: "ACTIVE",
        expectedEnd: { gte: now, lte: addDays(now, 30) },
        ...(repId
          ? { subscriptions: { some: { salespersonId: repId } } }
          : {}),
      },
      include: { company: { select: { name: true } } },
      orderBy: { expectedEnd: "asc" },
    }),
    prisma.lead.findMany({
      where: {
        ...leadScope,
        createdAt: { gte: startOfMonth(subMonths(now, window - 1)) },
      },
      select: { createdAt: true, type: true },
    }),
  ]);

  // Repeat-customer rate groups branches under their parent company —
  // metrics roll up even though quotes/pricing stay per-branch. When scoped
  // to a rep, only their customers count.
  const [projectCounts, companyParents] = await Promise.all([
    prisma.project.groupBy({
      by: ["companyId"],
      where: repId
        ? { company: { subscriptions: { some: { salespersonId: repId } } } }
        : undefined,
      _count: true,
    }),
    prisma.company.findMany({
      select: { id: true, parentCompanyId: true },
    }),
  ]);
  const rootOf = new Map(
    companyParents.map((c) => [c.id, c.parentCompanyId ?? c.id])
  );
  const projectsByRoot = new Map<string, number>();
  for (const pc of projectCounts) {
    const root = rootOf.get(pc.companyId) ?? pc.companyId;
    projectsByRoot.set(root, (projectsByRoot.get(root) ?? 0) + pc._count);
  }
  const rootsWithProjects = projectsByRoot.size;
  const companiesWith2Plus = [...projectsByRoot.values()].filter(
    (n) => n >= 2
  ).length;

  const mrr = activeSubs.reduce((sum, s) => sum + Number(s.mrr), 0);
  const nonRetired = trailers.filter((t) => t.status !== "RETIRED").length;
  const deployed = trailers.filter((t) => t.status === "DEPLOYED").length;

  // MRR trend over the selected window, from subscription start/end dates.
  const allSubs = [...activeSubs.map((s) => ({ ...s, endedAt: null as Date | null })), ...endedSubs];
  const mrrTrend: MonthPoint[] = [];
  for (let i = window - 1; i >= 0; i--) {
    const monthEnd = endOfMonth(subMonths(now, i));
    const value = allSubs.reduce((sum, s) => {
      const started = s.startDate <= monthEnd;
      const stillOn = !s.endedAt || s.endedAt > monthEnd;
      return started && stillOn ? sum + Number(s.mrr) : sum;
    }, 0);
    mrrTrend.push({ month: format(monthEnd, "MMM"), mrr: value });
  }

  // MRR movement over the window: new vs roll-off vs churn.
  const movement: MovementPoint[] = [];
  for (let i = window - 1; i >= 0; i--) {
    const mStart = startOfMonth(subMonths(now, i));
    const mEnd = endOfMonth(subMonths(now, i));
    const newMrr = allSubs
      .filter((s) => s.startDate >= mStart && s.startDate <= mEnd)
      .reduce((sum, s) => sum + Number(s.mrr), 0);
    const endedThisMonth = endedSubs.filter(
      (s) => s.endedAt && s.endedAt >= mStart && s.endedAt <= mEnd
    );
    const rollOff = endedThisMonth
      .filter((s) => s.endReason === "PROJECT_COMPLETED")
      .reduce((sum, s) => sum + Number(s.mrr), 0);
    const churn = endedThisMonth
      .filter((s) => s.endReason !== "PROJECT_COMPLETED")
      .reduce((sum, s) => sum + Number(s.mrr), 0);
    movement.push({
      month: format(mStart, "MMM"),
      newMrr,
      rollOff: -rollOff,
      churn: -churn,
    });
  }

  // Leads by month by type over the window.
  const leadsByMonth: LeadsPoint[] = [];
  for (let i = window - 1; i >= 0; i--) {
    const mStart = startOfMonth(subMonths(now, i));
    const mEnd = endOfMonth(subMonths(now, i));
    const inMonth = leadsInWindow.filter(
      (l) => l.createdAt >= mStart && l.createdAt <= mEnd
    );
    leadsByMonth.push({
      month: format(mStart, "MMM"),
      newCompany: inMonth.filter((l) => l.type === "NEW_COMPANY").length,
      newProject: inMonth.filter((l) => l.type === "NEW_PROJECT").length,
    });
  }

  // Average duration of ended subscriptions, in months.
  const durations = endedSubs
    .filter((s) => s.endedAt)
    .map(
      (s) =>
        (s.endedAt!.getTime() - s.startDate.getTime()) /
        (1000 * 60 * 60 * 24 * 30.44)
    );
  const avgDurationMonths =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;

  return {
    stats: {
      mrr,
      arr: mrr * 12,
      activeSubscriptions: activeSubs.length,
      utilization: nonRetired > 0 ? Math.round((deployed / nonRetired) * 100) : 0,
      // Only meaningful when scoped to a rep.
      repDeployedUnits,
      scopedToRep: !!repId,
      pipelineValue: openLeads.reduce(
        (sum, l) => sum + (l.estValue ? Number(l.estValue) : 0),
        0
      ),
      pipelineMrr: openLeads.reduce(
        (sum, l) => sum + (l.estMrr ? Number(l.estMrr) : 0),
        0
      ),
      openLeadCount: openLeads.length,
      winRate:
        wonCount + lostCount > 0
          ? Math.round((wonCount / (wonCount + lostCount)) * 100)
          : null,
      overdueAmount:
        Number(overdueInvoices._sum.amountDue ?? 0) -
        Number(overdueInvoices._sum.amountPaid ?? 0),
      overdueCount: overdueInvoices._count,
      repeatRate:
        rootsWithProjects > 0
          ? Math.round((companiesWith2Plus / rootsWithProjects) * 100)
          : null,
      avgDurationMonths,
    },
    mrrTrend,
    movement,
    leadsByMonth,
    upcomingCompletions: upcomingCompletions.map((p) => ({
      id: p.id,
      name: p.name,
      company: p.company.name,
      expectedEnd: p.expectedEnd,
    })),
  };
}
