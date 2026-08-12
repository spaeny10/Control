import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { applyTaxToDraftInvoice, reportTaxPaid } from "@/lib/tax";
import { chargeConvenienceFeeIfCardPaid } from "@/lib/convenience-fee";
import type { InvoiceStatus } from "@prisma/client";

function mapInvoiceStatus(status: Stripe.Invoice.Status | null): InvoiceStatus {
  switch (status) {
    case "open":
      return "OPEN";
    case "paid":
      return "PAID";
    case "void":
      return "VOID";
    case "uncollectible":
      return "UNCOLLECTIBLE";
    default:
      return "DRAFT";
  }
}

/* Match-only, never create.

   We raise invoices; Stripe is a payment rail for the minority who pay by card,
   so a Stripe invoice always corresponds to one of ours that we pushed. If
   there's no match, that's a Stripe object we didn't create — most likely made
   in their dashboard — and inventing a local row for it would put an invoice
   with a fabricated number into the books. Log and ignore instead.

   Our own fields are never overwritten: the number, the line items, and the
   amounts we computed are the record. Only payment state comes back from
   Stripe. */
async function recordStripePayment(invoice: Stripe.Invoice) {
  if (!invoice.id) return null;

  const existing = await prisma.invoice.findUnique({
    where: { stripeInvoiceId: invoice.id },
    select: { id: true, subscriptionId: true },
  });
  if (!existing) {
    console.warn(
      `[stripe webhook] no local invoice for ${invoice.id} — ignoring. ` +
        `Invoices are raised in the app; Stripe only collects card payments.`
    );
    return null;
  }

  await prisma.invoice.update({
    where: { id: existing.id },
    data: {
      status: mapInvoiceStatus(invoice.status),
      amountPaid: invoice.amount_paid / 100,
      // Stripe owns these two because it hosts the payment page.
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      pdfUrl: invoice.invoice_pdf,
      paidAt:
        invoice.status_transitions?.paid_at != null
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : null,
    },
  });

  return existing.subscriptionId
    ? await prisma.subscription.findUnique({
        where: { id: existing.subscriptionId },
      })
    : null;
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    /* Only fires for card-payment invoices we pushed to Stripe ourselves.
       Tax is now calculated when the invoice is raised in the app, not by
       patching a Stripe draft, so this only runs for a Stripe invoice that
       somehow lacks it — and does nothing when the invoice isn't ours. */
    case "invoice.created": {
      const invoice = event.data.object as Stripe.Invoice;
      const matched = await recordStripePayment(invoice);
      if (matched !== null || invoice.id) {
        try {
          await applyTaxToDraftInvoice(stripe, invoice);
        } catch (err) {
          console.error(
            "[stripe webhook] tax on draft invoice failed:",
            err instanceof Error ? err.message : err
          );
        }
      }
      break;
    }

    case "invoice.finalized":
    case "invoice.updated":
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscription = await recordStripePayment(invoice);
      if (event.type === "invoice.paid") {
        // Cash-basis filing: the transaction reaches TaxCloud now, not when the
        // invoice was raised.
        const paidAt =
          invoice.status_transitions?.paid_at != null
            ? new Date(invoice.status_transitions.paid_at * 1000)
            : new Date();
        try {
          if (invoice.id) await reportTaxPaid(invoice.id, paidAt);
        } catch (err) {
          console.error(
            "[stripe webhook] reporting tax to TaxCloud failed:",
            err instanceof Error ? err.message : err
          );
        }
        /* The convenience fee can only be known now — it depends on how they
           actually paid. Queued onto their next invoice rather than added up
           front, so a check-payer is never billed for card processing. */
        try {
          await chargeConvenienceFeeIfCardPaid(stripe, invoice);
        } catch (err) {
          console.error(
            "[stripe webhook] convenience fee failed:",
            err instanceof Error ? err.message : err
          );
        }
        // A paid invoice clears PAST_DUE.
        if (subscription && subscription.status === "PAST_DUE") {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "ACTIVE" },
          });
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscription = await recordStripePayment(invoice);
      if (subscription && subscription.status === "ACTIVE") {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: "PAST_DUE" },
        });
        await prisma.message.create({
          data: {
            channel: "SYSTEM",
            body: `Invoice payment failed (${invoice.number ?? invoice.id}) — subscription marked past due`,
            subscriptionId: subscription.id,
          },
        });
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const subscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSub.id },
      });
      if (subscription && subscription.status !== "ENDED") {
        if (stripeSub.status === "canceled") {
          // Canceled from the Stripe dashboard — reflect locally but leave
          // the end reason for the team to fill in.
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              status: "ENDED",
              endedAt: new Date(),
              endReason: subscription.endReason ?? "OTHER",
              endNotes:
                subscription.endNotes ??
                "Canceled via Stripe dashboard — set the real end reason in the app",
            },
          });
        } else if (
          stripeSub.status === "past_due" ||
          stripeSub.status === "unpaid"
        ) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "PAST_DUE" },
          });
        } else if (
          stripeSub.status === "active" &&
          subscription.status === "PAST_DUE"
        ) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "ACTIVE" },
          });
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
