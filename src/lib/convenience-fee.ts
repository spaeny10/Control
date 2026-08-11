import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/stripe";

/* Convenience fee on card payments.

   Charged only when a card was actually used. We can't know that when the
   invoice is raised, and adding it up front would bill a customer who then
   mails a check — so the fee is detected on payment and queued as a pending
   invoice item, which Stripe attaches to that customer's next invoice.

   Fails safe in both directions: if we can't confirm the payment method, no fee
   is charged, and a replayed webhook can't bill twice. */

/** Read the payment-method type off a paid invoice. Stripe has moved this
    around across API versions — modern invoices carry a `payments` list, older
    ones a top-level payment_intent or charge — so all three shapes are tried
    and an unknown result means "don't charge". */
async function paymentMethodType(
  stripe: Stripe,
  invoice: Stripe.Invoice
): Promise<string | null> {
  const loose = invoice as unknown as {
    payments?: {
      data?: { payment?: { payment_intent?: string | { id: string } } }[];
    };
    payment_intent?: string | { id: string };
    charge?: string | { id: string };
  };

  const idOf = (v: string | { id: string } | undefined | null) =>
    typeof v === "string" ? v : (v?.id ?? null);

  const piId =
    idOf(loose.payments?.data?.[0]?.payment?.payment_intent) ??
    idOf(loose.payment_intent);

  try {
    if (piId) {
      const pi = await stripe.paymentIntents.retrieve(piId, {
        expand: ["latest_charge"],
      });
      const charge = pi.latest_charge;
      if (charge && typeof charge !== "string") {
        return charge.payment_method_details?.type ?? null;
      }
      // No charge expanded — fall back to what the intent was set up to accept,
      // but only trust it when there's exactly one possibility.
      return pi.payment_method_types?.length === 1
        ? pi.payment_method_types[0]
        : null;
    }
    const chargeId = idOf(loose.charge);
    if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId);
      return charge.payment_method_details?.type ?? null;
    }
  } catch (err) {
    console.error(
      "[fee] could not read payment method:",
      err instanceof Error ? err.message : err
    );
  }
  return null;
}

/* Called from invoice.paid. Records how the invoice was paid and, when it was a
   card on a subscription whose terms carry a fee, queues that fee onto the
   customer's next invoice. */
export async function chargeConvenienceFeeIfCardPaid(
  stripe: Stripe,
  invoice: Stripe.Invoice
): Promise<void> {
  if (!invoice.id) return;

  const local = await prisma.invoice.findUnique({
    where: { stripeInvoiceId: invoice.id },
    select: {
      id: true,
      amountPaid: true,
      convenienceFeeAmount: true,
      subscription: {
        select: {
          id: true,
          cardPaymentAllowed: true,
          convenienceFeePct: true,
        },
      },
    },
  });
  // Already billed a fee for this invoice — a replayed webhook stops here.
  if (!local || local.convenienceFeeAmount !== null) return;

  const method = await paymentMethodType(stripe, invoice);
  const byCard = method === "card";

  // Record how it was paid regardless — useful even when no fee applies.
  await prisma.invoice.update({
    where: { id: local.id },
    data: { paidByCard: byCard },
  });

  if (!byCard) return;

  const sub = local.subscription;
  const pct = sub?.convenienceFeePct ? Number(sub.convenienceFeePct) : 0;
  if (!sub?.cardPaymentAllowed || pct <= 0) return;

  // Fee is on what actually ran through the card, tax included, since that's
  // what we were charged processing on.
  const base = Number(local.amountPaid);
  const fee = Math.round(base * (pct / 100) * 100) / 100;
  if (fee <= 0) return;

  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer?.id ?? null);
  if (!customerId) return;

  try {
    /* No `invoice` param, so it sits pending on the customer and Stripe sweeps
       it onto the next invoice automatically. */
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: toCents(fee),
      currency: invoice.currency ?? "usd",
      description: `Card convenience fee (${pct}%) — invoice ${invoice.number ?? invoice.id}`,
    });
  } catch (err) {
    console.error(
      "[fee] could not queue convenience fee:",
      err instanceof Error ? err.message : err
    );
    return;
  }

  await prisma.invoice.update({
    where: { id: local.id },
    data: { convenienceFeeAmount: fee },
  });
  await prisma.message.create({
    data: {
      channel: "SYSTEM",
      body: `Paid by card — ${pct}% convenience fee of $${fee.toFixed(2)} added to the next invoice.`,
      subscriptionId: sub.id,
    },
  });
}
