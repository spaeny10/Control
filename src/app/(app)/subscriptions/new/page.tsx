import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ConvertQuoteForm } from "@/components/subscriptions/convert-quote-form";
import { QuoteLineItemsTable } from "@/components/quotes/quote-line-items-table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { quoteTotals } from "@/lib/quote-utils";

export const metadata = { title: "Convert quote" };

export default async function NewSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ quoteId?: string }>;
}) {
  const { quoteId } = await searchParams;
  if (!quoteId) redirect("/quotes");

  const [quote, availableTrailers] = await Promise.all([
    prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        company: { select: { name: true } },
        project: { select: { name: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
        subscriptions: { select: { id: true } },
      },
    }),
    prisma.trailer.findMany({
      where: { status: "AVAILABLE" },
      orderBy: { unitNumber: "asc" },
      select: { id: true, unitNumber: true, model: true },
    }),
  ]);
  if (!quote) notFound();
  if (quote.subscriptions.length > 0)
    redirect(`/subscriptions/${quote.subscriptions[0].id}`);

  const totals = quoteTotals(quote.lineItems);
  const suggestedUnits = quote.lineItems
    .filter((i) => i.cycle !== "ONE_TIME")
    .reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Convert {quote.number} to subscription
        </h1>
        <p className="text-muted-foreground">
          {quote.company.name}
          {quote.project && ` · ${quote.project.name}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Accepted quote —{" "}
            <Link href={`/quotes/${quote.id}`} className="hover:underline">
              {quote.number}
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <QuoteLineItemsTable lineItems={quote.lineItems} totals={totals} />
        </CardContent>
      </Card>

      <ConvertQuoteForm
        quoteId={quote.id}
        suggestedUnits={suggestedUnits}
        availableTrailers={availableTrailers}
      />
    </div>
  );
}
