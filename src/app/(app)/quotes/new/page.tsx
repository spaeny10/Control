import { prisma } from "@/lib/prisma";
import { QuoteBuilder } from "@/components/quotes/quote-builder";
import { getQuoteBuilderOptions } from "@/lib/quote-utils";

export const metadata = { title: "New quote" };

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const { leadId } = await searchParams;
  const options = await getQuoteBuilderOptions();

  // Pre-fill from a lead when arriving via "Create quote" on a lead.
  let initial;
  if (leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (lead?.companyId) {
      initial = {
        companyId: lead.companyId,
        contactId: lead.contactId,
        projectId: lead.projectId,
        leadId: lead.id,
        validUntil: null,
        terms: null,
        lineItems: [],
      };
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New quote</h1>
        <p className="text-muted-foreground">
          Build the quote, then send the customer a click-to-accept link
        </p>
      </div>
      <QuoteBuilder {...options} initial={initial} />
    </div>
  );
}
