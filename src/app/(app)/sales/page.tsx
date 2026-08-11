import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { OPEN_PIPELINE_STAGES } from "@/lib/lead-tracks";
import { startOfMonth, subMonths, endOfMonth, format } from "date-fns";

export const metadata = { title: "Sales" };

export default async function SalesPage() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [
    users,
    activeSubs,
    endedSubs,
    unattributed,
    openActivities,
    overdueActivities,
    completedThisWeek,
    openLeads,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { salesTeam: { select: { id: true, name: true } } },
    }),
    prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE", "PAUSED"] } },
      select: { mrr: true, salespersonId: true, startDate: true },
    }),
    prisma.subscription.findMany({
      where: {
        status: "ENDED",
        startDate: { gte: startOfMonth(subMonths(new Date(), 2)) },
      },
      select: { mrr: true, salespersonId: true, startDate: true },
    }),
    prisma.subscription.count({
      where: {
        status: { in: ["ACTIVE", "PAST_DUE", "PAUSED"] },
        salespersonId: null,
      },
    }),
    prisma.activity.groupBy({
      by: ["assigneeId"],
      where: { done: false },
      _count: true,
    }),
    prisma.activity.groupBy({
      by: ["assigneeId"],
      where: { done: false, dueDate: { lt: now } },
      _count: true,
    }),
    prisma.activity.groupBy({
      by: ["assigneeId"],
      where: { done: true, completedAt: { gte: weekAgo } },
      _count: true,
    }),
    /* Carries track and stage so the forecast split, the prospecting counts,
       and the unqualified backlog all come from one query. reps x 2 types x 4
       open stages is trivially small. */
    prisma.lead.groupBy({
      by: ["ownerId", "type", "stage"],
      where: {
        OR: [
          { type: "NEW_PROJECT", stage: { notIn: ["WON", "LOST"] } },
          // All stages on the organization track — vendor approval is the win
          // there, so closed ones still represent live relationship value.
          { type: "NEW_COMPANY" },
        ],
      },
      _count: true,
      _sum: { estValue: true, estMrr: true },
    }),
  ]);

  const countBy = (
    rows: { assigneeId: string | null; _count: number }[],
    id: string
  ) => rows.find((r) => r.assigneeId === id)?._count ?? 0;
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));
  const allRecentSubs = [...activeSubs, ...endedSubs];

  const reps = users.map((u) => {
    const attributed = activeSubs.filter((s) => s.salespersonId === u.id);
    const activeMrr = attributed.reduce((sum, s) => sum + Number(s.mrr), 0);
    const rate = Number(u.commissionRate);
    const newThisMonth = allRecentSubs
      .filter(
        (s) => s.salespersonId === u.id && s.startDate >= thisMonthStart
      )
      .reduce((sum, s) => sum + Number(s.mrr), 0);
    const newLastMonth = allRecentSubs
      .filter(
        (s) =>
          s.salespersonId === u.id &&
          s.startDate >= lastMonthStart &&
          s.startDate <= lastMonthEnd
      )
      .reduce((sum, s) => sum + Number(s.mrr), 0);
    // Money comes only from project-track forecast rows, so a stray estMrr on
    // an organization lead is structurally unreachable from these figures.
    const myLeads = openLeads.filter((l) => l.ownerId === u.id);
    const projectForecast = myLeads.filter(
      (l) => l.type === "NEW_PROJECT" && OPEN_PIPELINE_STAGES.includes(l.stage)
    );
    // Active conversations plus approved vendors — the relationship footprint.
    const orgLeads = myLeads.filter(
      (l) =>
        l.type === "NEW_COMPANY" &&
        (OPEN_PIPELINE_STAGES.includes(l.stage) || l.stage === "WON")
    );
    const unqualified = myLeads.filter(
      (l) => l.type === "NEW_PROJECT" && l.stage === "UNQUALIFIED"
    );
    const sum = (
      rows: typeof myLeads,
      pick: (r: (typeof myLeads)[number]) => unknown
    ) => rows.reduce((s, r) => s + Number(pick(r) ?? 0), 0);
    return {
      id: u.id,
      name: u.name,
      team: u.salesTeam,
      activeMrr,
      subscriptions: attributed.length,
      rate,
      commission: (activeMrr * rate) / 100,
      newThisMonth,
      newLastMonth,
      openActivities: countBy(openActivities, u.id),
      overdueActivities: countBy(overdueActivities, u.id),
      completedThisWeek: countBy(completedThisWeek, u.id),
      projectLeadCount: projectForecast.reduce((s, r) => s + r._count, 0),
      projectPipelineMrr: sum(projectForecast, (r) => r._sum.estMrr),
      // Prospecting is counted, never dollarized.
      orgLeadCount: orgLeads.reduce((s, r) => s + r._count, 0),
      unqualifiedCount: unqualified.reduce((s, r) => s + r._count, 0),
    };
  });

  // Counts all three lead buckets, not just the forecast — otherwise a rep
  // doing pure early-stage prospecting would silently vanish from the team
  // view, which is exactly the wrong incentive under a two-track model.
  const activeReps = reps.filter(
    (r) =>
      r.activeMrr > 0 ||
      r.rate > 0 ||
      r.team ||
      r.openActivities > 0 ||
      r.projectLeadCount > 0 ||
      r.orgLeadCount > 0 ||
      r.unqualifiedCount > 0 ||
      r.completedThisWeek > 0
  );

  // Team rollups (reps without a team grouped under "No team").
  const teamMap = new Map<
    string,
    { name: string; mrr: number; commission: number; reps: number }
  >();
  for (const rep of activeReps) {
    const key = rep.team?.id ?? "none";
    const entry = teamMap.get(key) ?? {
      name: rep.team?.name ?? "No team",
      mrr: 0,
      commission: 0,
      reps: 0,
    };
    entry.mrr += rep.activeMrr;
    entry.commission += rep.commission;
    entry.reps += 1;
    teamMap.set(key, entry);
  }

  const totalCommission = activeReps.reduce((s, r) => s + r.commission, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <p className="text-muted-foreground">
          Rep performance and commission on attributed active MRR ·{" "}
          {format(now, "MMMM yyyy")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total monthly commission
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(totalCommission)}
            </p>
          </CardContent>
        </Card>
        {[...teamMap.values()].slice(0, 2).map((t) => (
          <Card key={t.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(t.mrr)}/mo</p>
              <p className="text-xs text-muted-foreground">
                {t.reps} rep{t.reps === 1 ? "" : "s"} ·{" "}
                {formatCurrency(t.commission)} commission
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team activity</CardTitle>
          <CardDescription>
            Effort feeding the pipeline: planned work, overdue items, and what
            got done in the last 7 days. Organization leads are counted, not
            forecast — they carry no MRR. Click a rep for their full breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rep</TableHead>
                <TableHead className="text-right">Open activities</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="text-right">Done (7d)</TableHead>
                <TableHead className="text-right">Project leads</TableHead>
                <TableHead className="text-right">Project pipeline</TableHead>
                <TableHead className="text-right">Organizations</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeReps.map((rep) => (
                <TableRow key={rep.id}>
                  <TableCell>
                    <Link
                      href={`/sales/${rep.id}`}
                      className="font-medium hover:underline"
                    >
                      {rep.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    {rep.openActivities}
                  </TableCell>
                  <TableCell className="text-right">
                    {rep.overdueActivities > 0 ? (
                      <Badge variant="destructive">
                        {rep.overdueActivities}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {rep.completedThisWeek}
                  </TableCell>
                  <TableCell className="text-right">
                    {rep.projectLeadCount}
                    {rep.unqualifiedCount > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        +{rep.unqualifiedCount} unqual.
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(rep.projectPipelineMrr)}/mo
                  </TableCell>
                  {/* Count only — prospecting is never dollarized. */}
                  <TableCell className="text-right text-muted-foreground">
                    {rep.orgLeadCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/sales/${rep.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      View →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reps</CardTitle>
          <CardDescription>
            Commission = attributed active MRR × rate. Rates and teams are set
            in Settings → Sales teams.
            {unattributed > 0 &&
              ` ${unattributed} active subscription${
                unattributed === 1 ? " has" : "s have"
              } no salesperson attributed.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rep</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Active MRR</TableHead>
                <TableHead className="text-right">Subs</TableHead>
                <TableHead className="text-right">New MRR (this mo)</TableHead>
                <TableHead className="text-right">New MRR (last mo)</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Commission/mo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeReps.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No attributed sales yet. Subscriptions are attributed to
                    the lead owner when a quote converts.
                  </TableCell>
                </TableRow>
              )}
              {activeReps.map((rep) => (
                <TableRow key={rep.id}>
                  <TableCell>
                    <Link
                      href={`/sales/${rep.id}`}
                      className="font-medium hover:underline"
                    >
                      {rep.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {rep.team ? (
                      <Badge variant="secondary">{rep.team.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(rep.activeMrr)}/mo
                  </TableCell>
                  <TableCell className="text-right">
                    {rep.subscriptions}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(rep.newThisMonth)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatCurrency(rep.newLastMonth)}
                  </TableCell>
                  <TableCell className="text-right">{rep.rate}%</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(rep.commission)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
