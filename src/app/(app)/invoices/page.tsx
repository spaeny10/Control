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
import { formatCurrency, formatDate } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";
import { ExternalLink } from "lucide-react";
import { SearchInput } from "@/components/layout/search-input";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = q?.trim();

  const invoices = await prisma.invoice.findMany({
    where: search
      ? {
          OR: [
            { number: { contains: search, mode: "insensitive" } },
            {
              subscription: {
                company: {
                  name: { contains: search, mode: "insensitive" },
                },
              },
            },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      subscription: {
        include: { company: { select: { id: true, name: true } } },
      },
    },
  });

  const outstanding = invoices
    .filter((i) => i.status === "OPEN")
    .reduce((sum, i) => sum + Number(i.amountDue) - Number(i.amountPaid), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">
            Synced from Stripe · {formatCurrency(outstanding)} outstanding
          </p>
        </div>
        <SearchInput placeholder="Search invoices..." />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No invoices yet. They sync automatically once Stripe
                    billing is connected and webhooks are registered.
                  </TableCell>
                </TableRow>
              )}
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    {inv.number ?? inv.stripeInvoiceId}
                  </TableCell>
                  <TableCell>
                    {inv.subscription ? (
                      <Link
                        href={`/subscriptions/${inv.subscription.id}`}
                        className="hover:underline"
                      >
                        {inv.subscription.company.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(Number(inv.amountDue))}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(inv.dueDate)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(inv.paidAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(inv.status)}>
                      {inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {inv.hostedInvoiceUrl && (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
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
