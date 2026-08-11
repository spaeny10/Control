import Link from "next/link";
import { getAccountingKpis } from "@/lib/kpi";
import { StatTiles, type StatTile } from "@/components/dashboard/stat-tiles";
import {
  MrrTrendChart,
  MrrMovementChart,
} from "@/components/dashboard/charts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterPills } from "@/components/layout/filter-pills";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CircleDollarSign,
  Repeat,
  AlertCircle,
  Timer,
  ExternalLink,
} from "lucide-react";

/* The books' morning view: what's billing, what's overdue, what's been sold
   but isn't billing yet, and what revenue is about to roll off. */
export async function AccountingDashboard({ months }: { months: number }) {
  const kpis = await getAccountingKpis(months);
  const now = new Date();

  const tiles: StatTile[] = [
    {
      label: "MRR",
      value: formatCurrency(kpis.mrr),
      sub: `${formatCurrency(kpis.arr)} annualized`,
      icon: CircleDollarSign,
      tint: "bg-[#2a78d6]/10 text-[#2a78d6]",
    },
    {
      label: "Active subscriptions",
      value: String(kpis.activeSubscriptions),
      sub:
        kpis.pastDueCount > 0
          ? `${kpis.pastDueCount} past due`
          : "none past due",
      icon: Repeat,
      tint:
        kpis.pastDueCount > 0
          ? "bg-destructive/10 text-destructive"
          : "bg-[#eb6834]/10 text-[#eb6834]",
    },
    {
      label: "Overdue invoices",
      value: kpis.overdueCount > 0 ? formatCurrency(kpis.overdueAmount) : "$0",
      sub: `${kpis.overdueCount} invoice${kpis.overdueCount === 1 ? "" : "s"}`,
      icon: AlertCircle,
      tint:
        kpis.overdueCount > 0
          ? "bg-destructive/10 text-destructive"
          : "bg-[#2a78d6]/10 text-[#2a78d6]",
    },
    {
      label: "Avg rental duration",
      value:
        kpis.avgDurationMonths !== null
          ? `${kpis.avgDurationMonths.toFixed(1)} mo`
          : "—",
      sub:
        kpis.repeatRate !== null
          ? `${kpis.repeatRate}% repeat customers`
          : "ended subscriptions",
      icon: Timer,
      tint: "bg-[#eb6834]/10 text-[#eb6834]",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Range
        </span>
        <FilterPills
          basePath="/"
          param="range"
          current={String(months)}
          includeAll={false}
          keepParams={{ view: "accounting" }}
          options={[
            { value: "3", label: "3 mo" },
            { value: "6", label: "6 mo" },
            { value: "12", label: "12 mo" },
            { value: "24", label: "24 mo" },
          ]}
        />
      </div>

      <StatTiles tiles={tiles} />

      {/* Money that should be moving but isn't — the two attention cards. */}
      {kpis.acceptedUnconverted.length > 0 && (
        <Card className="border-[#eb6834]/50">
          <CardHeader>
            <CardTitle className="text-base">
              Accepted, not yet billing ({kpis.acceptedUnconverted.length})
            </CardTitle>
            <CardDescription>
              The customer said yes but the quote hasn&apos;t been converted, so
              no subscription exists and nothing is invoicing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {kpis.acceptedUnconverted.map((q) => (
                <div
                  key={q.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/quotes/${q.id}`}
                      className="font-medium hover:underline"
                    >
                      {q.number}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {q.company}
                      {q.acceptedAt && ` · accepted ${formatDate(q.acceptedAt)}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium">
                    {formatCurrency(q.monthlyValue)}/mo
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {kpis.overdueInvoices.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">
              Overdue invoices ({kpis.overdueCount})
            </CardTitle>
            <CardDescription>
              Open past their due date, oldest first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {kpis.overdueInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    {inv.subscriptionId ? (
                      <Link
                        href={`/subscriptions/${inv.subscriptionId}`}
                        className="font-medium hover:underline"
                      >
                        {inv.company ?? inv.number ?? "Invoice"}
                      </Link>
                    ) : (
                      <span className="font-medium">
                        {inv.company ?? inv.number ?? "Invoice"}
                      </span>
                    )}
                    <p className="truncate text-xs text-muted-foreground">
                      {inv.number && `${inv.number} · `}
                      due {formatDate(inv.dueDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        inv.dueDate && inv.dueDate < now && "text-destructive"
                      )}
                    >
                      {formatCurrency(inv.outstanding)}
                    </span>
                    {inv.hostedInvoiceUrl && (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        title="Open in Stripe"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {kpis.overdueCount > kpis.overdueInvoices.length && (
              <p className="pt-2 text-xs text-muted-foreground">
                Showing the {kpis.overdueInvoices.length} oldest of{" "}
                {kpis.overdueCount}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              MRR — last {kpis.windowMonths} months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MrrTrendChart data={kpis.mrrTrend} />
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
            <MrrMovementChart data={kpis.movement} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Billing winding down — next 30 days (
            {kpis.windingDown.length})
          </CardTitle>
          <CardDescription>
            Live jobs near their estimated end, with the MRR that rolls off
            when they finish. Ending a subscription needs an end reason — that
            split is what keeps natural roll-off out of the churn number.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {kpis.windingDown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing ending in the next 30 days.
            </p>
          ) : (
            <div className="divide-y">
              {kpis.windingDown.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    {p.subscriptionId ? (
                      <Link
                        href={`/subscriptions/${p.subscriptionId}`}
                        className="font-medium hover:underline"
                      >
                        {p.company}
                      </Link>
                    ) : (
                      <span className="font-medium">{p.company}</span>
                    )}
                    <p className="truncate text-xs text-muted-foreground">
                      {p.name} · est. end {formatDate(p.expectedEnd)}
                    </p>
                  </div>
                  {p.endingMrr > 0 && (
                    <Badge variant="secondary">
                      {formatCurrency(p.endingMrr)}/mo ends
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
