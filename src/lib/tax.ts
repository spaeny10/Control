import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  calculateTax,
  commitOrder,
  markOrderCompleted,
  isTaxCloudConfigured,
  type TaxAddress,
  type TaxLineItemInput,
} from "@/lib/taxcloud";
import { toCents } from "@/lib/stripe";

/* Sales tax orchestration.

   Tax is calculated per INVOICE, not per conversion: every recurring period is
   its own taxable transaction at whatever rate applies then. So this runs from
   the Stripe `invoice.created` webhook, while the invoice is still a draft we
   can add a line to.

   Filing is cash-basis, so the TaxCloud order is created uncommitted and only
   marked complete when payment lands.

   Every function is failure-isolated. A tax problem must never block billing —
   an invoice that goes out untaxed is recoverable, an invoice that never goes
   out is lost revenue. Problems surface via Invoice.taxNeedsReview. */

/** General tangible personal property — the fallback when a line has no
    catalog product to inherit a TIC from. */
const DEFAULT_TIC = 0;

/* `ok` means the calculation ran, not that tax was charged — a legitimate zero
   is still a successful calculation, just one worth a second look. */
export type TaxOutcome =
  | { ok: true; amount: number; needsReview: boolean }
  | { ok: false; reason: string };

function siteAddressOf(p: {
  siteStreet: string | null;
  siteCity: string | null;
  siteState: string | null;
  siteZip: string | null;
}): TaxAddress | null {
  if (!p.siteStreet || !p.siteCity || !p.siteState || !p.siteZip) return null;
  return {
    line1: p.siteStreet,
    city: p.siteCity,
    state: p.siteState,
    zip: p.siteZip,
  };
}

/** Resolve each Stripe line back to our catalog to find its TIC. Lines created
    from a catalog product carry that product's Stripe id; ad-hoc lines don't and
    fall back to the default. */
async function ticByStripeProduct(
  productIds: string[]
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const products = await prisma.planProduct.findMany({
    where: { stripeProductId: { in: productIds } },
    select: { stripeProductId: true, tic: true },
  });
  const map = new Map<string, number>();
  for (const p of products) {
    if (p.stripeProductId) map.set(p.stripeProductId, p.tic ?? DEFAULT_TIC);
  }
  return map;
}

/* Calculate tax for a draft invoice, add it as a line, and open an uncommitted
   TaxCloud order. Called from invoice.created — the only window where the
   invoice is still mutable. */
export async function applyTaxToDraftInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice
): Promise<TaxOutcome> {
  if (!isTaxCloudConfigured()) {
    return { ok: false, reason: "TaxCloud not configured" };
  }
  if (!invoice.id) return { ok: false, reason: "Invoice has no id" };
  // Only drafts can take another line.
  if (invoice.status !== "draft") {
    return { ok: false, reason: `Invoice is ${invoice.status}, not draft` };
  }

  const subRef =
    (invoice as unknown as { subscription?: string | { id: string } })
      .subscription ??
    invoice.parent?.subscription_details?.subscription ??
    null;
  const stripeSubscriptionId =
    typeof subRef === "string" ? subRef : (subRef?.id ?? null);
  if (!stripeSubscriptionId) {
    return { ok: false, reason: "Not a subscription invoice" };
  }

  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: {
      id: true,
      companyId: true,
      project: {
        select: {
          siteStreet: true,
          siteCity: true,
          siteState: true,
          siteZip: true,
        },
      },
    },
  });
  if (!subscription) {
    return { ok: false, reason: "No local subscription for this invoice" };
  }
  const destination = subscription.project
    ? siteAddressOf(subscription.project)
    : null;
  if (!destination) {
    // Conversion requires a complete address, so this means it was cleared
    // afterwards. Bill untaxed and flag rather than hold the invoice.
    return { ok: false, reason: "Jobsite address is incomplete" };
  }

  const lines = invoice.lines?.data ?? [];
  if (lines.length === 0) return { ok: false, reason: "No invoice lines" };

  const productIdOf = (l: Stripe.InvoiceLineItem): string | null => {
    const price = (l as unknown as { price?: Stripe.Price | null }).price;
    const product = price?.product;
    return typeof product === "string" ? product : (product?.id ?? null);
  };
  const ticMap = await ticByStripeProduct(
    lines.map(productIdOf).filter((x): x is string => !!x)
  );

  const lineItems: TaxLineItemInput[] = lines.map((l) => {
    const pid = productIdOf(l);
    return {
      itemId: l.id,
      // Stripe amounts are in cents and already reflect quantity/proration, so
      // send the line total at quantity 1 rather than re-deriving unit price.
      price: (l.amount ?? 0) / 100,
      quantity: 1,
      tic: pid ? (ticMap.get(pid) ?? DEFAULT_TIC) : DEFAULT_TIC,
    };
  });

  const taxable = lineItems.filter((li) => li.price > 0);
  if (taxable.length === 0) {
    return { ok: false, reason: "Nothing billable to tax" };
  }

  const calc = await calculateTax({
    destination,
    lineItems: taxable,
    customerId: subscription.companyId,
  });
  if (!calc) return { ok: false, reason: "TaxCloud not configured" };
  if (!calc.ok) {
    await flagForReview(invoice.id, calc.error);
    return { ok: false, reason: calc.error };
  }

  const { cartId, totalTax } = calc.quote;
  /* Zero is ambiguous: TaxCloud answers zero both for a genuinely exempt line
     and for a state we haven't registered. It can't tell us which, so a zero on
     billable work gets flagged for a human rather than trusted silently. */
  const needsReview = totalTax === 0;

  if (totalTax > 0) {
    try {
      await stripe.invoiceItems.create({
        customer:
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer!.id,
        invoice: invoice.id,
        amount: toCents(totalTax),
        currency: invoice.currency ?? "usd",
        description: `Sales tax — ${destination.city}, ${destination.state} ${destination.zip}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stripe error";
      await flagForReview(invoice.id, `Could not add tax line: ${msg}`);
      return { ok: false, reason: msg };
    }
  }

  /* Open the order uncommitted. Cash-basis filing means it only counts once the
     check clears, which reportTaxPaid does. */
  const opened = await commitOrder({
    orderId: invoice.id,
    cartId,
    completed: false,
  });

  await prisma.invoice
    .update({
      where: { stripeInvoiceId: invoice.id },
      data: {
        taxAmount: totalTax,
        taxCloudCartId: cartId,
        taxCloudOrderId: opened?.ok ? invoice.id : null,
        taxNeedsReview: needsReview || !opened?.ok,
      },
    })
    // The invoice row may not exist yet — invoice.created can beat our upsert.
    // The next invoice.updated writes the mirror, and tax is already on Stripe.
    .catch(() => undefined);

  return { ok: true, amount: totalTax, needsReview };
}

async function flagForReview(stripeInvoiceId: string, reason: string) {
  await prisma.invoice
    .update({
      where: { stripeInvoiceId },
      data: { taxNeedsReview: true },
    })
    .catch(() => undefined);
  console.error(`[tax] ${stripeInvoiceId}: ${reason}`);
}

/* Report the transaction to TaxCloud once payment lands. Cash-basis: nothing
   enters a filing until the money is in. Idempotent — a replayed
   invoice.paid won't double-report. */
export async function reportTaxPaid(
  stripeInvoiceId: string,
  paidAt: Date
): Promise<void> {
  if (!isTaxCloudConfigured()) return;
  const invoice = await prisma.invoice.findUnique({
    where: { stripeInvoiceId },
    select: { taxCloudOrderId: true, taxReportedAt: true },
  });
  if (!invoice?.taxCloudOrderId || invoice.taxReportedAt) return;

  const result = await markOrderCompleted({
    orderId: invoice.taxCloudOrderId,
    completedDate: paidAt,
  });
  if (result?.ok) {
    await prisma.invoice.update({
      where: { stripeInvoiceId },
      data: { taxReportedAt: paidAt, taxNeedsReview: false },
    });
  } else if (result) {
    await flagForReview(stripeInvoiceId, `Could not report: ${result.error}`);
  }
}
