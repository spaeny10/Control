import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ActivityRow,
  type ActivityView,
} from "@/components/activities/activity-row";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";
import { OPEN_PIPELINE_STAGES, stageLabel } from "@/lib/lead-tracks";
import { CYCLE_SUFFIX } from "@/lib/cycles";
import { getRepEmailStats } from "@/lib/email-oversight";
import { UnansweredCard } from "@/components/dashboard/unanswered-card";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

export const metadata = { title: "Rep detail" };

function activityParent(a: {
  lead: { id: string; title: string } | null;
  company: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  subscription: { id: string; company: { name: string } } | null;
}) {
  if (a.lead) return { href: `/leads/${a.lead.id}`, label: a.lead.title };
  if (a.company)
    return { href: `/companies/${a.company.id}`, label: a.company.name };
  if (a.project)
    return { href: `/projects/${a.project.id}`, label: a.project.name };
  if (a.subscription)
    return {
      href: `/subscriptions/${a.subscription.id}`,
      label: a.subscription.company.name,
    };
  return null;
}

const activityInclude = {
  lead: { select: { id: true, title: true } },
  company: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  subscription: {
    select: { id: true, company: { select: { name: true } } },
  },
} as const;

export default async function RepDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { salesTeam: { select: { name: true } } },
  });
  if (!user) notFound();

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [
    openActivities,
    recentDone,
    leads,
    subscriptions,
    email,
    sourcedProjectLeads,
  ] =
    await Promise.all([
      prisma.activity.findMany({
        where: { assigneeId: userId, done: false },
        orderBy: { dueDate: "asc" },
        include: activityInclude,
      }),
      prisma.activity.findMany({
        where: {
          assigneeId: userId,
          done: true,
          completedAt: { gte: weekAgo },
        },
        orderBy: { completedAt: "desc" },
        take: 10,
        include: activityInclude,
      }),
      prisma.lead.findMany({
        where: {
          ownerId: userId,
          OR: [
            { type: "NEW_PROJECT", stage: { notIn: ["WON", "LOST"] } },
            /* Organization leads at every stage. Vendor approval IS the win on
               this track, so excluding closed ones would hide exactly the
               relationship work the rep should get credit for. */
            { type: "NEW_COMPANY" },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: { company: { select: { name: true } } },
      }),
      prisma.subscription.findMany({
        where: {
          salespersonId: userId,
          status: { in: ["ACTIVE", "PAST_DUE", "PAUSED"] },
        },
        orderBy: { createdAt: "desc" },
        include: {
          company: { select: { name: true } },
          project: { select: { name: true } },
        },
      }),
      getRepEmailStats(userId),
      /* Prospecting credit: project leads that grew out of a relationship this
         rep opened, even if someone else now runs the job. */
      prisma.lead.count({
        where: {
          type: "NEW_PROJECT",
          sourceLead: { ownerId: userId },
        },
      }),
    ]);

  const activeMrr = subscriptions.reduce((s, x) => s + Number(x.mrr), 0);
  const rate = Number(user.commissionRate);
  // Split by track: only project leads at a qualified stage are a forecast.
  const projectForecast = leads.filter(
    (l) => l.type === "NEW_PROJECT" && OPEN_PIPELINE_STAGES.includes(l.stage)
  );
  const projectUnqualified = leads.filter(
    (l) => l.type === "NEW_PROJECT" && l.stage === "UNQUALIFIED"
  );
  const orgLeads = leads.filter((l) => l.type === "NEW_COMPANY");
  const pipeline = projectForecast.reduce(
    (s, l) => s + (l.estValue ? Number(l.estValue) : 0),
    0
  );
  const pipelineMrr = projectForecast.reduce(
    (s, l) => s + (l.estMrr ? Number(l.estMrr) : 0),
    0
  );
  const overdueCount = openActivities.filter((a) => a.dueDate < now).length;

  const toView = (a: (typeof openActivities)[number]): ActivityView => {
    const parent = activityParent(a);
    return {
      id: a.id,
      type: a.type,
      title: a.title,
      notes: a.notes,
      dueLabel: formatDateTime(a.dueDate),
      overdue: !a.done && a.dueDate < now,
      assigneeName: null,
      parentHref: parent?.href,
      parentLabel: parent?.label,
    };
  };

  const tiles = [
    {
      label: "Attributed MRR",
      value: `${formatCurrency(activeMrr)}/mo`,
      sub: `${formatCurrency((activeMrr * rate) / 100)} commission at ${rate}%`,
    },
    {
      label: "Project pipeline",
      value: `${formatCurrency(pipelineMrr)}/mo`,
      sub: `${projectForecast.length} qualified · ${formatCurrency(pipeline)} total`,
    },
    {
      // Count only. Prospecting is visible here but never dollarized.
      label: "Organizations",
      value: String(orgLeads.length),
      sub: (() => {
        const n = orgLeads.filter((l) => l.stage === "WON").length;
        return `${n} approved vendor${n === 1 ? "" : "s"}`;
      })(),
    },
    {
      // Merged so the fourth slot can carry prospecting without losing info.
      label: "Activities",
      value: String(openActivities.length),
      sub: `${overdueCount} overdue · ${recentDone.length} done in 7d`,
      alert: overdueCount > 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
          {user.salesTeam && (
            <Badge variant="secondary">{user.salesTeam.name}</Badge>
          )}
          {!user.isActive && <Badge variant="outline">Deactivated</Badge>}
        </div>
        <p className="text-muted-foreground">
          <Link href="/sales" className="hover:underline">
            ← Back to Sales
          </Link>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {tile.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-2xl font-bold ${tile.alert ? "text-destructive" : ""}`}
              >
                {tile.value}
              </p>
              <p className="text-xs text-muted-foreground">{tile.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Open activities ({openActivities.length})
            </CardTitle>
            <CardDescription>
              Checking one off logs it to the record&apos;s history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {openActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing planned — schedule activities from any lead, company,
                or project.
              </p>
            ) : (
              <div className="divide-y">
                {openActivities.map((a) => (
                  <ActivityRow key={a.id} activity={toView(a)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Completed — last 7 days ({recentDone.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentDone.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No activities completed this week.
              </p>
            ) : (
              <div className="divide-y">
                {recentDone.map((a) => {
                  const parent = activityParent(a);
                  return (
                    <div key={a.id} className="py-2 text-sm">
                      <p className="font-medium">
                        {a.title}
                        {parent && (
                          <Link
                            href={parent.href}
                            className="ml-2 text-xs font-normal text-primary hover:underline"
                          >
                            {parent.label}
                          </Link>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.type.replace("_", " ").toLowerCase()} · done{" "}
                        {a.completedAt ? formatDateTime(a.completedAt) : "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <UnansweredCard threads={email.unanswered} showRep={false} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer email</CardTitle>
          <CardDescription>
            {email.sent.toLocaleString()} sent all-time ·{" "}
            {email.sentThisWeek.toLocaleString()} this week ·{" "}
            {email.received.toLocaleString()} replies received ·{" "}
            {email.unanswered.length} awaiting a reply
          </CardDescription>
        </CardHeader>
        <CardContent>
          {email.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No customer email yet for {user.name}.
            </p>
          ) : (
            <div className="divide-y">
              {email.recent.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 py-2 text-sm"
                >
                  {m.direction === "IN" ? (
                    <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0 text-[#2a78d6]" />
                  ) : (
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {m.subject ?? "(no subject)"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.href ? (
                        <Link href={m.href} className="hover:underline">
                          {m.customer ?? m.address ?? "—"}
                        </Link>
                      ) : (
                        (m.customer ?? m.address ?? "—")
                      )}{" "}
                      · {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Project pipeline ({projectForecast.length})
          </CardTitle>
          {projectUnqualified.length > 0 && (
            <CardDescription>
              <Link
                href={`/leads?track=NEW_PROJECT&view=list&stage=UNQUALIFIED&owner=${userId}`}
                className="hover:underline"
              >
                {projectUnqualified.length} unqualified project lead
                {projectUnqualified.length === 1 ? "" : "s"} aren&apos;t
                forecast →
              </Link>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Est. MRR</TableHead>
                <TableHead className="text-right">Total value</TableHead>
                <TableHead>Expected close</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectForecast.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No qualified project leads owned by {user.name}.
                  </TableCell>
                </TableRow>
              )}
              {projectForecast.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link
                      href={`/leads/${l.id}`}
                      className="font-medium hover:underline"
                    >
                      {l.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.company?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(l.stage)}>
                      {stageLabel(l.type, l.stage)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {l.estMrr ? `${formatCurrency(Number(l.estMrr))}/mo` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {l.estValue ? formatCurrency(Number(l.estValue)) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(l.expectedClose)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(orgLeads.length > 0 || sourcedProjectLeads > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Organizations ({orgLeads.length})
            </CardTitle>
            <CardDescription>
              Relationship work — no revenue columns, because these carry no
              forecast. {sourcedProjectLeads} project lead
              {sourcedProjectLeads === 1 ? "" : "s"} came from relationships
              {" "}
              {user.name.split(" ")[0]} opened.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgLeads.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link
                        href={`/leads/${l.id}`}
                        className="font-medium hover:underline"
                      >
                        {l.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.company?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(l.stage)}>
                        {stageLabel(l.type, l.stage)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.source ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(l.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Active subscriptions ({subscriptions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active subscriptions attributed yet.
            </p>
          ) : (
            <div className="divide-y">
              {subscriptions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <Link
                      href={`/subscriptions/${s.id}`}
                      className="font-medium hover:underline"
                    >
                      {s.company.name}
                      {s.project && ` — ${s.project.name}`}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(Number(s.cycleAmount))}
                      {CYCLE_SUFFIX[s.billingCycle]} · since{" "}
                      {formatDate(s.startDate)}
                    </p>
                  </div>
                  <Badge variant={statusBadgeVariant(s.status)}>
                    {s.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
