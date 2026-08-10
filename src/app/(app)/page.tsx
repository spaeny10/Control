import Link from "next/link";
import { getDashboardData } from "@/lib/kpi";
import {
  MrrTrendChart,
  MrrMovementChart,
  LeadsChart,
} from "@/components/dashboard/charts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  ActivityRow,
  type ActivityView,
} from "@/components/activities/activity-row";
import { FilterPills } from "@/components/layout/filter-pills";
import {
  CircleDollarSign,
  Repeat,
  Truck,
  Target,
  Trophy,
  AlertCircle,
  RotateCcw,
  Timer,
} from "lucide-react";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const months = ["3", "6", "12", "24"].includes(range ?? "")
    ? parseInt(range!)
    : 6;

  const session = await auth();
  const [
    { stats, mrrTrend, movement, leadsByMonth, upcomingCompletions },
    myActivities,
  ] = await Promise.all([
    getDashboardData(months),
    prisma.activity.findMany({
      where: { done: false, assigneeId: session?.user?.id },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: {
        lead: { select: { id: true, title: true } },
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        subscription: {
          select: { id: true, company: { select: { name: true } } },
        },
      },
    }),
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

  const tiles = [
    {
      label: "MRR",
      value: formatCurrency(stats.mrr),
      sub: `${formatCurrency(stats.arr)} annualized`,
      icon: CircleDollarSign,
      tint: "bg-[#2a78d6]/10 text-[#2a78d6]",
    },
    {
      label: "Active subscriptions",
      value: String(stats.activeSubscriptions),
      icon: Repeat,
      tint: "bg-[#eb6834]/10 text-[#eb6834]",
    },
    {
      label: "Trailer utilization",
      value: `${stats.utilization}%`,
      sub: "deployed / active fleet",
      icon: Truck,
      tint: "bg-[#2a78d6]/10 text-[#2a78d6]",
    },
    {
      label: "Pipeline MRR",
      value: `${formatCurrency(stats.pipelineMrr)}/mo`,
      sub: `${formatCurrency(stats.pipelineValue)} total · ${stats.openLeadCount} leads`,
      icon: Target,
      tint: "bg-[#eb6834]/10 text-[#eb6834]",
    },
    {
      label: "Win rate",
      value: stats.winRate !== null ? `${stats.winRate}%` : "—",
      sub: "won vs lost leads",
      icon: Trophy,
      tint: "bg-[#2a78d6]/10 text-[#2a78d6]",
    },
    {
      label: "Overdue invoices",
      value:
        stats.overdueCount > 0
          ? formatCurrency(stats.overdueAmount)
          : "$0",
      sub: `${stats.overdueCount} invoice${stats.overdueCount === 1 ? "" : "s"}`,
      icon: AlertCircle,
      tint:
        stats.overdueCount > 0
          ? "bg-destructive/10 text-destructive"
          : "bg-[#2a78d6]/10 text-[#2a78d6]",
    },
    {
      label: "Repeat customers",
      value: stats.repeatRate !== null ? `${stats.repeatRate}%` : "—",
      sub: "companies with 2+ projects",
      icon: RotateCcw,
      tint: "bg-[#eb6834]/10 text-[#eb6834]",
    },
    {
      label: "Avg rental duration",
      value:
        stats.avgDurationMonths !== null
          ? `${stats.avgDurationMonths.toFixed(1)} mo`
          : "—",
      sub: "ended subscriptions",
      icon: Timer,
      tint: "bg-[#2a78d6]/10 text-[#2a78d6]",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            The pulse of the BIGVIEW rental business
          </p>
        </div>
        <FilterPills
          basePath="/"
          param="range"
          current={String(months)}
          includeAll={false}
          options={[
            { value: "3", label: "3 mo" },
            { value: "6", label: "6 mo" },
            { value: "12", label: "12 mo" },
            { value: "24", label: "24 mo" },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="flex items-center gap-3 pt-6">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile.tint}`}
              >
                <tile.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-muted-foreground">
                  {tile.label}
                </p>
                <p className="text-xl font-bold tracking-tight">
                  {tile.value}
                </p>
                {tile.sub && (
                  <p className="truncate text-xs text-muted-foreground">
                    {tile.sub}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {activityViews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              My activities ({activityViews.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {activityViews.map((a) => (
                <ActivityRow key={a.id} activity={a} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              MRR — last {months} months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MrrTrendChart data={mrrTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              MRR movement — roll-off vs churn
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Project roll-off is expected in the rental business — only true
              churn (gray vs red) signals a problem.
            </p>
          </CardHeader>
          <CardContent>
            <MrrMovementChart data={movement} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              New leads by month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LeadsChart data={leadsByMonth} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Projects wrapping up — next 30 days
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Heads-up for trailer pickups and re-marketing the units
            </p>
          </CardHeader>
          <CardContent>
            {upcomingCompletions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nothing ending in the next 30 days.
              </p>
            ) : (
              <div className="divide-y">
                {upcomingCompletions.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <div>
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {p.company}
                      </p>
                    </div>
                    <span className="text-muted-foreground">
                      ends {formatDate(p.expectedEnd)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
