import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BigviewLogo } from "@/components/brand/logo";
import { PublicQuoteActions } from "@/components/quotes/public-quote-actions";
import { QuoteLineItemsTable } from "@/components/quotes/quote-line-items-table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate, formatDateTime, fullName } from "@/lib/format";
import { quoteTotals } from "@/lib/quote-utils";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

export const metadata = { title: "Your BIGVIEW Quote" };

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: {
      company: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
      project: { select: { name: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!quote || quote.status === "DRAFT") notFound();

  const totals = quoteTotals(quote.lineItems);
  const expired =
    quote.status === "EXPIRED" ||
    (quote.status === "SENT" &&
      quote.validUntil !== null &&
      quote.validUntil < new Date());

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-3xl space-y-6 p-4 py-10 sm:p-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <BigviewLogo textClassName="text-4xl" />
          <p className="text-sm text-muted-foreground">
            Security Trailer Rental Quote
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{quote.number}</CardTitle>
              <Badge variant="outline">
                Prepared for {quote.company.name}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {quote.contact && <p>Attn: {fullName(quote.contact)}</p>}
              {quote.project && <p>Project: {quote.project.name}</p>}
              {quote.validUntil && (
                <p>Valid until {formatDate(quote.validUntil)}</p>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <QuoteLineItemsTable lineItems={quote.lineItems} totals={totals} />
          </CardContent>
        </Card>

        {quote.terms && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Terms</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{quote.terms}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            {quote.status === "ACCEPTED" ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
                <p className="font-semibold">Quote accepted</p>
                <p className="text-sm text-muted-foreground">
                  Accepted by {quote.acceptedByName} on{" "}
                  {formatDateTime(quote.acceptedAt)} — we&apos;ll be in touch
                  shortly to schedule delivery.
                </p>
              </div>
            ) : quote.status === "DECLINED" ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <XCircle className="h-10 w-10 text-muted-foreground" />
                <p className="font-semibold">Quote declined</p>
                <p className="text-sm text-muted-foreground">
                  Changed your mind? Contact us and we&apos;ll reopen it.
                </p>
              </div>
            ) : expired ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <Clock className="h-10 w-10 text-muted-foreground" />
                <p className="font-semibold">This quote has expired</p>
                <p className="text-sm text-muted-foreground">
                  Contact us for updated pricing.
                </p>
              </div>
            ) : (
              <PublicQuoteActions token={token} />
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          BIGVIEW Security Trailers · Jetstream Systems
        </p>
      </div>
    </div>
  );
}
