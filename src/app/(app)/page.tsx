import { getUserAreas } from "@/lib/authz";
import { FilterPills } from "@/components/layout/filter-pills";
import { SalesDashboard } from "@/components/dashboard/sales-dashboard";
import { FleetDashboard } from "@/components/dashboard/fleet-dashboard";
import { AccountingDashboard } from "@/components/dashboard/accounting-dashboard";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Dashboard" };

/* One dashboard per role area rather than one blended page. A member lands on
   their area; an admin (or multi-area member) gets tabs. Each dashboard owns
   its data fetching and its filters, so switching tabs pays only for the view
   you're looking at. */

const VIEWS = [
  { key: "sales", area: "SALES", label: "Sales" },
  { key: "fleet", area: "FLEET", label: "Fleet" },
  { key: "accounting", area: "ACCOUNTING", label: "Accounting" },
] as const;

const SUBTITLES: Record<string, string> = {
  sales: "Pipeline, prospecting, and what's waiting on a reply",
  fleet: "The yard: what's rolling this week and what needs a truck",
  accounting: "What's billing, what's overdue, and what's rolling off",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; range?: string; rep?: string }>;
}) {
  const { view, range, rep } = await searchParams;
  const months = ["3", "6", "12", "24"].includes(range ?? "")
    ? parseInt(range!)
    : 6;

  const { userId, isAdmin, areas } = await getUserAreas();
  const available = VIEWS.filter((v) => isAdmin || areas.includes(v.area));

  if (available.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Your account has no dashboard areas yet — ask an admin to assign one
          under Settings → Team.
        </CardContent>
      </Card>
    );
  }

  const current =
    available.find((v) => v.key === view)?.key ?? available[0].key;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {available.find((v) => v.key === current)?.label} dashboard
          </h1>
          <p className="text-muted-foreground">{SUBTITLES[current]}</p>
        </div>
        {available.length > 1 && (
          <FilterPills
            basePath="/"
            param="view"
            current={current}
            includeAll={false}
            // Range carries across tabs; the rep filter is sales-only.
            keepParams={{ range: months === 6 ? undefined : String(months) }}
            options={available.map((v) => ({ value: v.key, label: v.label }))}
          />
        )}
      </div>

      {current === "sales" && (
        <SalesDashboard
          months={months}
          rep={rep}
          sessionUserId={userId}
          isAdmin={isAdmin}
        />
      )}
      {current === "fleet" && <FleetDashboard />}
      {current === "accounting" && <AccountingDashboard months={months} />}
    </div>
  );
}
