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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";
import { quoteTotals } from "@/lib/quote-utils";
import { CYCLE_SUFFIX } from "@/lib/cycles";
import { FilterPills } from "@/components/layout/filter-pills";
import { Plus } from "lucide-react";

export const metadata = { title: "Quotes" };

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const validStatus = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"].includes(
    status ?? ""
  )
    ? (status as "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED")
    : undefined;

  const quotes = await prisma.quote.findMany({
    where: validStatus ? { status: validStatus } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      company: { select: { id: true, name: true } },
      lineItems: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quotes</h1>
          <p className="text-muted-foreground">
            {quotes.length} quote{quotes.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterPills
            basePath="/quotes"
            param="status"
            current={validStatus}
            options={[
              { value: "DRAFT", label: "Draft" },
              { value: "SENT", label: "Sent" },
              { value: "ACCEPTED", label: "Accepted" },
              { value: "DECLINED", label: "Declined" },
              { value: "EXPIRED", label: "Expired" },
            ]}
          />
          <Button asChild className="gap-1">
            <Link href="/quotes/new">
              <Plus className="h-4 w-4" /> New quote
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Recurring</TableHead>
                <TableHead className="text-right">One-time</TableHead>
                <TableHead>Valid until</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No quotes yet. Create your first one.
                  </TableCell>
                </TableRow>
              )}
              {quotes.map((q) => {
                const totals = quoteTotals(q.lineItems);
                const recurringCycles = Object.keys(
                  totals.recurring
                ) as (keyof typeof CYCLE_SUFFIX)[];
                return (
                  <TableRow key={q.id}>
                    <TableCell>
                      <Link
                        href={`/quotes/${q.id}`}
                        className="font-medium hover:underline"
                      >
                        {q.number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/companies/${q.company.id}`}
                        className="hover:underline"
                      >
                        {q.company.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {recurringCycles.length > 0
                        ? recurringCycles
                            .map(
                              (c) =>
                                `${formatCurrency(totals.recurring[c] ?? 0)}${CYCLE_SUFFIX[c]}`
                            )
                            .join(" + ")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {totals.oneTime > 0
                        ? formatCurrency(totals.oneTime)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(q.validUntil)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(q.status)}>
                        {q.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
