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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";

export const metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const subscriptions = await prisma.subscription.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      company: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      deployments: {
        where: { returnedAt: null },
        include: { trailer: { select: { unitNumber: true } } },
      },
    },
  });

  const active = subscriptions.filter(
    (s) => s.status === "ACTIVE" || s.status === "PAST_DUE"
  );
  const totalMrr = active.reduce((sum, s) => sum + Number(s.mrr), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground">
            {active.length} active · {formatCurrency(totalMrr)}/mo MRR
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All subscriptions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Units on site</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No subscriptions yet. Convert an accepted quote to start
                    one.
                  </TableCell>
                </TableRow>
              )}
              {subscriptions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={`/subscriptions/${s.id}`}
                      className="font-medium hover:underline"
                    >
                      {s.company.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {s.project ? (
                      <Link
                        href={`/projects/${s.project.id}`}
                        className="hover:underline"
                      >
                        {s.project.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.deployments.length > 0
                      ? s.deployments
                          .map((d) => d.trailer.unitNumber)
                          .join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(Number(s.mrr))}/mo
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(s.startDate)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(s.status)}>
                      {s.status}
                    </Badge>
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
