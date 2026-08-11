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

async function upsertInvoice(invoice: Stripe.Invoice) {
  // Older/newer API shapes expose the subscription ref differently.
  const subRef =
    (invoice as unknown as { subscription?: string | { id: string } })
      .subscription ??
    invoice.parent?.subscription_details?.subscription ??
    null;
  const stripeSubscriptionId =
    typeof subRef === "string" ? subRef : (subRef?.id ?? null);

  const subscription = stripeSubscriptionId
    ? await prisma.subscription.findUnique({
        where: { stripeSubscriptionId },
      })
    : null;

  await prisma.invoice.upsert({
    where: { stripeInvoiceId: invoice.id! },
    create: {
      stripeInvoiceId: invoice.id!,
      number: invoice.number,
      status: mapInvoiceStatus(invoice.status),
      amountDue: invoice.amount_due / 100,
      amountPaid: invoice.amount_paid / 100,
      currency: invoice.currency,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      pdfUrl: invoice.invoice_pdf,
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
      paidAt:
        invoice.status_transitions?.paid_at != null
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : null,
      periodStart: invoice.period_start
        ? new Date(invoice.period_start * 1000)
        : null,
      periodEnd: invoice.period_end
        ? new Date(invoice.period_end * 1000)
        : null,
      subscriptionId: subscription?.id,
    },
    update: {
      number: invoice.number,
      status: mapInvoiceStatus(invoice.status),
      amountDue: invoice.amount_due / 100,
      amountPaid: invoice.amount_paid / 100,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      pdfUrl: invoice.invoice_pdf,
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
      paidAt:
        invoice.status_transitions?.paid_at != null
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : null,
      subscriptionId: subscription?.id,
    },
  });

  return subscription;
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
    /* The only window where the invoice is still a draft we can add a line to.
       Sales tax is per-invoice because every recurring period is its own
       taxable transaction at whatever rate applies then. Failure-isolated: an
       untaxed invoice is recoverable, an invoice that never sends is not. */
    case "invoice.created": {
      const invoice = event.data.object as Stripe.Invoice;
      await upsertInvoice(invoice);
      try {
        await applyTaxToDraftInvoice(stripe, invoice);
      } catch (err) {
        console.error(
          "[stripe webhook] tax on draft invoice failed:",
          err instanceof Error ? err.message : err
        );
      }
      break;
    }

    case "invoice.finalized":
    case "invoice.updated":
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscription = await upsertInvoice(invoice);
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
      const subscription = await upsertInvoice(invoice);
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
