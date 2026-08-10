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
import { CYCLE_SUFFIX } from "@/lib/cycles";

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

  const [openActivities, recentDone, leads, subscriptions] =
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
        where: { ownerId: userId, stage: { notIn: ["WON", "LOST"] } },
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
    ]);

  const activeMrr = subscriptions.reduce((s, x) => s + Number(x.mrr), 0);
  const rate = Number(user.commissionRate);
  const pipeline = leads.reduce(
    (s, l) => s + (l.estValue ? Number(l.estValue) : 0),
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
      label: "Open pipeline",
      value: formatCurrency(pipeline),
      sub: `${leads.length} open lead${leads.length === 1 ? "" : "s"}`,
    },
    {
      label: "Open activities",
      value: String(openActivities.length),
      sub:
        overdueCount > 0
          ? `${overdueCount} overdue`
          : "nothing overdue",
      alert: overdueCount > 0,
    },
    {
      label: "Done (7 days)",
      value: String(recentDone.length),
      sub: "completed activities",
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Open pipeline ({leads.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Est. value</TableHead>
                <TableHead>Expected close</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No open leads owned by {user.name}.
                  </TableCell>
                </TableRow>
              )}
              {leads.map((l) => (
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
                      {l.stage.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
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
