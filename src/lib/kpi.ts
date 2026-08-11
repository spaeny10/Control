import { prisma } from "@/lib/prisma";
import { OPEN_PIPELINE_STAGES } from "@/lib/lead-tracks";
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

/** Organization prospecting, reported by count and stage only. There is no
    dollar figure here on purpose — a relationship has no job behind it yet, so
    any forecast would be fiction. Credit shows up as sourcedProjectLeads. */
export type ProspectingFunnel = {
  unqualified: number;
  contacted: number;
  qualified: number;
  approvedVendors: number;
  lost: number;
  /** Live relationship work: contacted + qualified. */
  active: number;
  /** Project leads these relationships produced inside the window. */
  sourcedProjectLeads: number;
  /** Raw counts so a thin denominator can suppress the rate. */
  wonInWindow: number;
  lostInWindow: number;
  winRate: number | null;
};

// Pass a repId to scope every figure to one salesperson: subscriptions by
// attribution, leads by owner, invoices/projects through their subscriptions.
export async function getDashboardData(
  months: number = 6,
  repId?: string
) {
  const now = new Date();
  const window = Math.min(36, Math.max(2, months));
  const windowStart = startOfMonth(subMonths(now, window - 1));
  const subScope = repId ? { salespersonId: repId } : {};
  const leadScope = repId ? { ownerId: repId } : {};

  const [
    activeSubs,
    endedSubs,
    trailers,
    repDeployedUnits,
    projectPipeline,
    projectUnqualifiedCount,
    prospectingByStage,
    closedByTrack,
    overdueInvoices,
    upcomingCompletions,
    leadsInWindow,
    sourcedProjectLeads,
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
    // The forecast: project track, qualified stages only. UNQUALIFIED is a
    // holding pen of unvetted leads and would inflate this with work nobody
    // has looked at yet.
    prisma.lead.findMany({
      where: {
        ...leadScope,
        type: "NEW_PROJECT",
        stage: { in: [...OPEN_PIPELINE_STAGES] },
      },
      select: { estValue: true, estMrr: true, stage: true },
    }),
    // Reported alongside, so the excluded backlog isn't invisible.
    prisma.lead.count({
      where: { ...leadScope, type: "NEW_PROJECT", stage: "UNQUALIFIED" },
    }),
    prisma.lead.groupBy({
      by: ["stage"],
      where: { ...leadScope, type: "NEW_COMPANY" },
      _count: true,
    }),
    // Win rate per track, windowed on closedAt. Pooling the two tracks would
    // average a quote-acceptance rate with a vendor-approval rate.
    prisma.lead.groupBy({
      by: ["type", "stage"],
      where: {
        ...leadScope,
        stage: { in: ["WON", "LOST"] },
        closedAt: { gte: windowStart },
      },
      _count: true,
    }),
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
      where: { ...leadScope, createdAt: { gte: windowStart } },
      select: { createdAt: true, type: true },
    }),
    /* Prospecting credit. Note the deliberate exception to leadScope: this
       filters on the SOURCE lead's owner, not the new lead's — the rep who
       opened the door keeps credit even when someone else runs the job. */
    prisma.lead.count({
      where: {
        type: "NEW_PROJECT",
        createdAt: { gte: windowStart },
        sourceLeadId: { not: null },
        ...(repId ? { sourceLead: { ownerId: repId } } : {}),
      },
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

  // Closed-lead counts, split by track.
  function closedCount(type: "NEW_PROJECT" | "NEW_COMPANY", stage: string) {
    return (
      closedByTrack.find((r) => r.type === type && r.stage === stage)?._count ??
      0
    );
  }
  const projectWon = closedCount("NEW_PROJECT", "WON");
  const projectLost = closedCount("NEW_PROJECT", "LOST");
  const orgWonInWindow = closedCount("NEW_COMPANY", "WON");
  const orgLostInWindow = closedCount("NEW_COMPANY", "LOST");

  const stageCount = (stage: string) =>
    prospectingByStage.find((r) => r.stage === stage)?._count ?? 0;
  const prospecting: ProspectingFunnel = {
    unqualified: stageCount("UNQUALIFIED"),
    contacted: stageCount("CONTACTED"),
    qualified: stageCount("QUALIFIED"),
    approvedVendors: stageCount("WON"),
    lost: stageCount("LOST"),
    active: stageCount("CONTACTED") + stageCount("QUALIFIED"),
    sourcedProjectLeads,
    wonInWindow: orgWonInWindow,
    lostInWindow: orgLostInWindow,
    winRate:
      orgWonInWindow + orgLostInWindow > 0
        ? Math.round(
            (orgWonInWindow / (orgWonInWindow + orgLostInWindow)) * 100
          )
        : null,
  };

  return {
    stats: {
      mrr,
      arr: mrr * 12,
      activeSubscriptions: activeSubs.length,
      utilization: nonRetired > 0 ? Math.round((deployed / nonRetired) * 100) : 0,
      // Only meaningful when scoped to a rep.
      repDeployedUnits,
      scopedToRep: !!repId,
      // Project track only — the one number that represents deployable
      // revenue. Renamed rather than reused so every consumer of the old
      // blended figure becomes a compile error instead of silently wrong.
      projectPipelineMrr: projectPipeline.reduce(
        (sum, l) => sum + (l.estMrr ? Number(l.estMrr) : 0),
        0
      ),
      projectPipelineValue: projectPipeline.reduce(
        (sum, l) => sum + (l.estValue ? Number(l.estValue) : 0),
        0
      ),
      projectPipelineCount: projectPipeline.length,
      projectUnqualifiedCount,
      projectWinRate:
        projectWon + projectLost > 0
          ? Math.round((projectWon / (projectWon + projectLost)) * 100)
          : null,
      projectWonCount: projectWon,
      projectLostCount: projectLost,
      winRateWindowMonths: window,
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
    prospecting,
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
