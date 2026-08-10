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
import { formatCurrency, formatDate } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { stats, mrrTrend, movement, leadsByMonth, upcomingCompletions } =
    await getDashboardData();

  const tiles: { label: string; value: string; sub?: string }[] = [
    {
      label: "MRR",
      value: formatCurrency(stats.mrr),
      sub: `${formatCurrency(stats.arr)} annualized`,
    },
    {
      label: "Active subscriptions",
      value: String(stats.activeSubscriptions),
    },
    {
      label: "Trailer utilization",
      value: `${stats.utilization}%`,
      sub: "deployed / active fleet",
    },
    {
      label: "Pipeline value",
      value: formatCurrency(stats.pipelineValue),
      sub: "open leads",
    },
    {
      label: "Win rate",
      value: stats.winRate !== null ? `${stats.winRate}%` : "—",
      sub: "won vs lost leads",
    },
    {
      label: "Overdue invoices",
      value:
        stats.overdueCount > 0
          ? formatCurrency(stats.overdueAmount)
          : "$0",
      sub: `${stats.overdueCount} invoice${stats.overdueCount === 1 ? "" : "s"}`,
    },
    {
      label: "Repeat customers",
      value: stats.repeatRate !== null ? `${stats.repeatRate}%` : "—",
      sub: "companies with 2+ projects",
    },
    {
      label: "Avg rental duration",
      value:
        stats.avgDurationMonths !== null
          ? `${stats.avgDurationMonths.toFixed(1)} mo`
          : "—",
      sub: "ended subscriptions",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          The pulse of the BIGVIEW rental business
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {tile.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{tile.value}</p>
              {tile.sub && (
                <p className="text-xs text-muted-foreground">{tile.sub}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">MRR — last 12 months</CardTitle>
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
