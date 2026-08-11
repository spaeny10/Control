import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { QuoteBuilder } from "@/components/quotes/quote-builder";
import { getQuoteBuilderOptions } from "@/lib/quote-utils";

export const metadata = { title: "Edit quote" };

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [quote, options] = await Promise.all([
    prisma.quote.findUnique({
      where: { id },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    }),
    getQuoteBuilderOptions(),
  ]);
  if (!quote) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Edit {quote.number}
        </h1>
        <p className="text-muted-foreground">
          Changes replace the current line items
        </p>
      </div>
      <QuoteBuilder
        {...options}
        quoteId={quote.id}
        initial={{
          companyId: quote.companyId,
          contactId: quote.contactId,
          billingContactId: quote.billingContactId,
          projectId: quote.projectId,
          leadId: quote.leadId,
          validUntil: quote.validUntil
            ? quote.validUntil.toISOString().slice(0, 10)
            : null,
          terms: quote.terms,
          lineItems: quote.lineItems.map((li) => ({
            cycle: li.cycle,
            description: li.description,
            quantity: li.quantity,
            unitPrice: Number(li.unitPrice),
            planProductId: li.planProductId,
          })),
        }}
      />
    </div>
  );
}
