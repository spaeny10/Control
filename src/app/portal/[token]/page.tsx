import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BigviewLogo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";
import { quoteTotals } from "@/lib/quote-utils";
import { ExternalLink } from "lucide-react";

export const metadata = { title: "Customer Portal" };

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const company = await prisma.company.findUnique({
    where: { portalToken: token },
    include: {
      subscriptions: {
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: {
          project: { select: { name: true } },
          deployments: {
            where: { returnedAt: null },
            include: { trailer: { select: { unitNumber: true } } },
          },
          invoices: {
            where: { status: { in: ["OPEN", "PAID"] } },
            orderBy: { createdAt: "desc" },
            take: 12,
          },
        },
      },
      quotes: {
        where: { status: { in: ["SENT", "ACCEPTED"] } },
        orderBy: { createdAt: "desc" },
        include: { lineItems: true },
        take: 10,
      },
      projects: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
  if (!company) notFound();

  const activeSubs = company.subscriptions.filter(
    (s) => s.status !== "ENDED"
  );
  const openInvoices = company.subscriptions
    .flatMap((s) => s.invoices)
    .filter((i) => i.status === "OPEN");

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-4xl space-y-6 p-4 py-10 sm:p-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <BigviewLogo textClassName="text-3xl" markClassName="h-9" />
          <p className="text-sm text-muted-foreground">Customer Portal</p>
          <h1 className="text-xl font-semibold">{company.name}</h1>
        </div>

        {openInvoices.length > 0 && (
          <Card className="border-primary/50">
            <CardHeader>
              <CardTitle className="text-base">Open invoices</CardTitle>
              <CardDescription>
                Pay securely online via the links below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {openInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {inv.number ?? "Invoice"} ·{" "}
                        {formatCurrency(Number(inv.amountDue))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Due {formatDate(inv.dueDate)}
                      </p>
                    </div>
                    {inv.hostedInvoiceUrl ? (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Pay now <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <Badge variant="secondary">Invoiced</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Your rentals ({activeSubs.length} active)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {company.subscriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No rentals yet.
              </p>
            ) : (
              <div className="divide-y">
                {company.subscriptions.map((s) => (
                  <div key={s.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {s.project?.name ?? "Rental"}
                      </p>
                      <Badge variant={statusBadgeVariant(s.status)}>
                        {s.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(Number(s.mrr))}/mo · since{" "}
                      {formatDate(s.startDate)}
                      {s.deployments.length > 0 &&
                        ` · units on site: ${s.deployments
                          .map((d) => d.trailer.unitNumber)
                          .join(", ")}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {company.quotes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quotes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {company.quotes.map((q) => {
                  const totals = quoteTotals(q.lineItems);
                  return (
                    <div
                      key={q.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{q.number}</p>
                        <p className="text-xs text-muted-foreground">
                          {totals.monthly > 0 &&
                            `${formatCurrency(totals.monthly)}/mo`}
                          {totals.monthly > 0 && totals.oneTime > 0 && " + "}
                          {totals.oneTime > 0 &&
                            `${formatCurrency(totals.oneTime)} one-time`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusBadgeVariant(q.status)}>
                          {q.status}
                        </Badge>
                        {q.status === "SENT" && (
                          <a
                            href={`/q/${q.publicToken}`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Review & accept
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Questions? Contact your BIGVIEW rep — BIGVIEW Security Trailers ·
          Jetstream Systems
        </p>
      </div>
    </div>
  );
}
