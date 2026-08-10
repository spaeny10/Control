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

export async function getDashboardData() {
  const now = new Date();

  const [
    activeSubs,
    endedSubs,
    trailers,
    openLeads,
    wonCount,
    lostCount,
    overdueInvoices,
    companiesWithProjects,
    upcomingCompletions,
    leadsLastSixMonths,
  ] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE", "PAUSED"] } },
      select: { mrr: true, startDate: true },
    }),
    prisma.subscription.findMany({
      where: { status: "ENDED" },
      select: { mrr: true, startDate: true, endedAt: true, endReason: true },
    }),
    prisma.trailer.findMany({ select: { status: true } }),
    prisma.lead.findMany({
      where: { stage: { notIn: ["WON", "LOST"] } },
      select: { estValue: true },
    }),
    prisma.lead.count({ where: { stage: "WON" } }),
    prisma.lead.count({ where: { stage: "LOST" } }),
    prisma.invoice.aggregate({
      where: { status: "OPEN", dueDate: { lt: now } },
      _sum: { amountDue: true, amountPaid: true },
      _count: true,
    }),
    prisma.company.count({ where: { projects: { some: {} } } }),
    prisma.project.findMany({
      where: {
        status: "ACTIVE",
        expectedEnd: { gte: now, lte: addDays(now, 30) },
      },
      include: { company: { select: { name: true } } },
      orderBy: { expectedEnd: "asc" },
    }),
    prisma.lead.findMany({
      where: { createdAt: { gte: startOfMonth(subMonths(now, 5)) } },
      select: { createdAt: true, type: true },
    }),
  ]);

  // Repeat-customer rate needs "companies with >= 2 projects" — do it in JS.
  const projectCounts = await prisma.project.groupBy({
    by: ["companyId"],
    _count: true,
  });
  const companiesWith2Plus = projectCounts.filter((p) => p._count >= 2).length;

  const mrr = activeSubs.reduce((sum, s) => sum + Number(s.mrr), 0);
  const nonRetired = trailers.filter((t) => t.status !== "RETIRED").length;
  const deployed = trailers.filter((t) => t.status === "DEPLOYED").length;

  // MRR trend — last 12 months from subscription start/end dates.
  const allSubs = [...activeSubs.map((s) => ({ ...s, endedAt: null as Date | null })), ...endedSubs];
  const mrrTrend: MonthPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const monthEnd = endOfMonth(subMonths(now, i));
    const value = allSubs.reduce((sum, s) => {
      const started = s.startDate <= monthEnd;
      const stillOn = !s.endedAt || s.endedAt > monthEnd;
      return started && stillOn ? sum + Number(s.mrr) : sum;
    }, 0);
    mrrTrend.push({ month: format(monthEnd, "MMM"), mrr: value });
  }

  // MRR movement — last 6 months: new vs roll-off vs churn.
  const movement: MovementPoint[] = [];
  for (let i = 5; i >= 0; i--) {
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

  // Leads by month by type — last 6 months.
  const leadsByMonth: LeadsPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const mStart = startOfMonth(subMonths(now, i));
    const mEnd = endOfMonth(subMonths(now, i));
    const inMonth = leadsLastSixMonths.filter(
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
      pipelineValue: openLeads.reduce(
        (sum, l) => sum + (l.estValue ? Number(l.estValue) : 0),
        0
      ),
      winRate:
        wonCount + lostCount > 0
          ? Math.round((wonCount / (wonCount + lostCount)) * 100)
          : null,
      overdueAmount:
        Number(overdueInvoices._sum.amountDue ?? 0) -
        Number(overdueInvoices._sum.amountPaid ?? 0),
      overdueCount: overdueInvoices._count,
      repeatRate:
        companiesWithProjects > 0
          ? Math.round((companiesWith2Plus / companiesWithProjects) * 100)
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
