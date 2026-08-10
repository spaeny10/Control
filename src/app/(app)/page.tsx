import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          KPIs and metrics for your BIGVIEW rental business.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Phase 7</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          MRR, trailer utilization, pipeline value, MRR movement waterfall
          (separating project roll-off from true churn), and more will appear
          here once the CRM, quotes, and billing modules are in place.
        </CardContent>
      </Card>
    </div>
  );
}
