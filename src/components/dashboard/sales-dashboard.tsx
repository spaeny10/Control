import { prisma } from "@/lib/prisma";
import { getSalesKpis } from "@/lib/kpi";
import { getUnansweredThreads } from "@/lib/email-oversight";
import { getStalledQuoteLeads } from "@/lib/quote-oversight";
import { UnansweredCard } from "@/components/dashboard/unanswered-card";
import { StalledQuotesCard } from "@/components/dashboard/stalled-quotes-card";
import { ProspectingCard } from "@/components/dashboard/prospecting-card";
import { StatTiles, type StatTile } from "@/components/dashboard/stat-tiles";
import { LeadsChart } from "@/components/dashboard/charts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FilterPills } from "@/components/layout/filter-pills";
import {
  ActivityRow,
  type ActivityView,
} from "@/components/activities/activity-row";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Target, Trophy, UserPlus, Building2 } from "lucide-react";

/* The seller's morning view: what's the forecast, who's waiting on me, what
   died and needs a decision, and what's on my calendar. */
export async function SalesDashboard({
  months,
  rep,
  sessionUserId,
  isAdmin,
}: {
  months: number;
  rep?: string;
  sessionUserId: string;
  isAdmin: boolean;
}) {
  const reps = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ subscriptions: { some: {} } }, { ownedLeads: { some: {} } }],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  // Ignore an unknown/stale rep id rather than showing an empty dashboard.
  const repId = reps.some((r) => r.id === rep) ? rep : undefined;
  const repName = reps.find((r) => r.id === repId)?.name;

  const [kpis, myActivities, unanswered, stalledQuotes] = await Promise.all([
    getSalesKpis(months, repId),
    prisma.activity.findMany({
      // When filtered to a rep, show that rep's schedule instead of mine.
      where: { done: false, assigneeId: repId ?? sessionUserId },
      orderBy: { dueDate: "asc" },
      take: 10,
      include: {
        lead: { select: { id: true, title: true } },
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        subscription: {
          select: { id: true, company: { select: { name: true } } },
        },
      },
    }),
    // Admins see the whole team's waiting customers; members see their own.
    // A rep filter narrows it to that rep either way.
    getUnansweredThreads(repId ?? (isAdmin ? undefined : sessionUserId)),
    getStalledQuoteLeads(repId ?? (isAdmin ? undefined : sessionUserId)),
  ]);

  const now = new Date();
  const activityViews: ActivityView[] = myActivities.map((a) => {
    const parent = a.lead
      ? { href: `/leads/${a.lead.id}`, label: a.lead.title }
      : a.company
        ? { href: `/companies/${a.company.id}`, label: a.company.name }
        : a.project
          ? { href: `/projects/${a.project.id}`, label: a.project.name }
          : a.subscription
            ? {
                href: `/subscriptions/${a.subscription.id}`,
                label: a.subscription.company.name,
              }
            : null;
    return {
      id: a.id,
      type: a.type,
      title: a.title,
      notes: a.notes,
      dueLabel: formatDateTime(a.dueDate),
      overdue: a.dueDate < now,
      assigneeName: null,
      parentHref: parent?.href,
      parentLabel: parent?.label,
    };
  });
  const overdueCount = activityViews.filter((a) => a.overdue).length;

  const tiles: StatTile[] = [
    {
      label: "Project pipeline",
      value: `${formatCurrency(kpis.projectPipelineMrr)}/mo`,
      // Answers "what isn't in this number?" — the point of the two-track model.
      sub: `${kpis.projectPipelineCount} qualified · ${kpis.projectUnqualifiedCount} unqualified`,
      icon: Target,
      tint: "bg-[#eb6834]/10 text-[#eb6834]",
    },
    {
      label: "Quote win rate",
      value: kpis.projectWinRate !== null ? `${kpis.projectWinRate}%` : "—",
      sub: `${kpis.projectWonCount} won / ${kpis.projectLostCount} lost · ${kpis.windowMonths} mo`,
      icon: Trophy,
      tint: "bg-[#2a78d6]/10 text-[#2a78d6]",
    },
    {
      label: "New leads",
      value: String(kpis.newLeadsInWindow),
      sub: `created in the last ${kpis.windowMonths} mo`,
      icon: UserPlus,
      tint: "bg-[#2a78d6]/10 text-[#2a78d6]",
    },
    {
      label: "Prospecting",
      value: String(kpis.prospecting.active),
      sub: `active conversations · ${kpis.prospecting.approvedVendors} approved vendors`,
      icon: Building2,
      tint: "bg-[#eb6834]/10 text-[#eb6834]",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Range
          </span>
          <FilterPills
            basePath="/"
            param="range"
            current={String(months)}
            includeAll={false}
            keepParams={{ view: "sales", rep: repId }}
            options={[
              { value: "3", label: "3 mo" },
              { value: "6", label: "6 mo" },
              { value: "12", label: "12 mo" },
              { value: "24", label: "24 mo" },
            ]}
          />
        </div>
        {reps.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sales rep
            </span>
            <FilterPills
              basePath="/"
              param="rep"
              current={repId}
              keepParams={{
                view: "sales",
                range: months === 6 ? undefined : String(months),
              }}
              options={reps.map((r) => ({ value: r.id, label: r.name }))}
            />
          </div>
        )}
      </div>

      <StatTiles tiles={tiles} />

      {/* Alerts first, then information. */}
      <UnansweredCard threads={unanswered} showRep={isAdmin && !repId} />
      <StalledQuotesCard leads={stalledQuotes} showRep={isAdmin && !repId} />
      <ProspectingCard funnel={kpis.prospecting} ownerId={repId} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {repName ? `${repName}'s schedule` : "My schedule"} (
              {activityViews.length})
              {overdueCount > 0 && (
                <span className="ml-2 text-sm font-normal text-destructive">
                  {overdueCount} overdue
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityViews.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nothing planned. Schedule activities from any lead or company.
              </p>
            ) : (
              <div className="divide-y">
                {activityViews.map((a) => (
                  <ActivityRow key={a.id} activity={a} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New leads by month</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadsChart data={kpis.leadsByMonth} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
