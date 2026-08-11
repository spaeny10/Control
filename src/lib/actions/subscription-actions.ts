"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getStripe, toCents } from "@/lib/stripe";
import { STRIPE_INTERVALS, toMonthly } from "@/lib/cycles";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";
import type { Prisma, SubscriptionEndReason } from "@prisma/client";
import type Stripe from "stripe";

// Resolve (and cache) a Stripe Product for a quote line item. Catalog items
// cache the product id on PlanProduct; ad-hoc lines get a one-off product.
async function stripeProductFor(
  stripe: Stripe,
  item: { description: string; planProductId: string | null }
): Promise<string> {
  if (item.planProductId) {
    const plan = await prisma.planProduct.findUnique({
      where: { id: item.planProductId },
    });
    if (plan?.stripeProductId) return plan.stripeProductId;
    const product = await stripe.products.create({ name: item.description });
    if (plan) {
      await prisma.planProduct.update({
        where: { id: plan.id },
        data: { stripeProductId: product.id },
      });
    }
    return product.id;
  }
  const product = await stripe.products.create({ name: item.description });
  return product.id;
}

const convertSchema = z.object({
  quoteId: z.string().min(1),
  trailerIds: z.array(z.string()).min(0),
  startDate: z.string().optional(),
});

export async function convertQuoteToSubscription(input: {
  quoteId: string;
  trailerIds: string[];
  startDate?: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { quoteId, trailerIds, startDate } = parsed.data;

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      company: true,
      contact: true,
      lineItems: true,
      subscriptions: true,
      lead: { select: { ownerId: true, stage: true } },
    },
  });
  if (!quote) return { ok: false, error: "Quote not found" };
  if (quote.status !== "ACCEPTED") {
    return { ok: false, error: "Quote must be accepted before conversion" };
  }
  if (quote.subscriptions.length > 0) {
    return { ok: false, error: "Quote already converted" };
  }

  // All requested trailers must be available.
  const trailers = await prisma.trailer.findMany({
    where: { id: { in: trailerIds } },
  });
  const unavailable = trailers.filter((t) => t.status !== "AVAILABLE");
  if (unavailable.length > 0) {
    return {
      ok: false,
      error: `Not available: ${unavailable.map((t) => t.unitNumber).join(", ")}`,
    };
  }

  const recurringItems = quote.lineItems.filter(
    (i) => i.cycle !== "ONE_TIME"
  );
  const oneTimeItems = quote.lineItems.filter((i) => i.cycle === "ONE_TIME");

  // All recurring items share one cycle (enforced at quote creation).
  const cycles = [...new Set(recurringItems.map((i) => i.cycle))];
  if (cycles.length > 1) {
    return {
      ok: false,
      error: "Quote mixes recurring billing cycles — edit it to use one cycle",
    };
  }
  const billingCycle = cycles[0] ?? "MONTHLY";
  const cycleAmount = recurringItems.reduce(
    (sum, i) => sum + i.quantity * Number(i.unitPrice),
    0
  );
  // Normalized monthly value keeps MRR/KPIs comparable across cycles.
  const mrr = Math.round(toMonthly(cycleAmount, billingCycle) * 100) / 100;

  // ---- Stripe (when configured) ----
  const stripe = getStripe();
  let stripeCustomerId = quote.company.stripeCustomerId;
  let stripeSubscriptionId: string | null = null;
  let billingNote =
    "Billing: Stripe not connected — invoices must be handled manually until keys are configured.";

  if (stripe) {
    try {
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          name: quote.company.name,
          email: quote.contact?.email ?? undefined,
          metadata: { companyId: quote.company.id },
        });
        stripeCustomerId = customer.id;
        await prisma.company.update({
          where: { id: quote.company.id },
          data: { stripeCustomerId },
        });
      }

      const stripeInterval =
        STRIPE_INTERVALS[billingCycle as Exclude<typeof billingCycle, "ONE_TIME">];
      const recurringWithProducts = [];
      for (const item of recurringItems) {
        recurringWithProducts.push({
          quantity: item.quantity,
          price_data: {
            currency: "usd",
            unit_amount: toCents(Number(item.unitPrice)),
            recurring: stripeInterval,
            product: await stripeProductFor(stripe, item),
          },
        });
      }
      // One-time charges (delivery, setup) ride on the first invoice.
      const oneTimeWithProducts = [];
      for (const item of oneTimeItems) {
        oneTimeWithProducts.push({
          quantity: item.quantity,
          price_data: {
            currency: "usd",
            unit_amount: toCents(Number(item.unitPrice)),
            product: await stripeProductFor(stripe, item),
          },
        });
      }

      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        collection_method: "send_invoice",
        days_until_due: 30,
        items: recurringWithProducts,
        add_invoice_items: oneTimeWithProducts,
        metadata: { quoteId: quote.id, companyId: quote.company.id },
      });
      stripeSubscriptionId = subscription.id;
      billingNote =
        "Billing: Stripe subscription created — first invoice (incl. one-time charges) will be emailed by Stripe.";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown Stripe error";
      return { ok: false, error: `Stripe error: ${msg}` };
    }
  }

  // ---- Local records ----
  const subscription = await prisma.subscription.create({
    data: {
      status: "ACTIVE",
      startDate: startDate ? new Date(startDate) : new Date(),
      billingCycle,
      cycleAmount,
      mrr,
      stripeSubscriptionId,
      companyId: quote.companyId,
      projectId: quote.projectId,
      quoteId: quote.id,
      // Commission attribution: the lead owner won this; fall back to
      // whoever converted the quote.
      salespersonId: quote.lead?.ownerId ?? session.user.id,
      deployments: {
        create: trailerIds.map((trailerId) => ({ trailerId })),
      },
    },
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (trailerIds.length > 0) {
    ops.push(
      prisma.trailer.updateMany({
        where: { id: { in: trailerIds } },
        data: { status: "DEPLOYED" },
      })
    );
  }
  if (quote.projectId) {
    ops.push(
      prisma.project.update({
        where: { id: quote.projectId },
        data: { status: "ACTIVE" },
      })
    );
  }
  // The lead already went WON when the customer accepted; converting is a
  // fulfillment step. This only backfills leads accepted before that changed.
  if (quote.leadId && quote.lead?.stage !== "WON") {
    ops.push(
      prisma.lead.update({
        where: { id: quote.leadId },
        data: { stage: "WON", closedAt: new Date() },
      })
    );
  }
  ops.push(
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: `Subscription started from quote ${quote.number}. Units: ${
          trailers.map((t) => t.unitNumber).join(", ") || "none yet"
        }. ${billingNote}`,
        authorId: session.user.id,
        subscriptionId: subscription.id,
      },
    })
  );
  await prisma.$transaction(ops);

  revalidatePath("/subscriptions");
  revalidatePath("/fleet");
  revalidatePath("/leads");
  revalidatePath(`/quotes/${quote.id}`);
  return { ok: true, id: subscription.id };
}

// End a subscription with a required reason. PROJECT_COMPLETED is natural
// roll-off; the rest count as churn in KPIs.
export async function endSubscription(
  id: string,
  endReason: SubscriptionEndReason,
  endNotes?: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const subscription = await prisma.subscription.findUnique({
    where: { id },
    include: {
      deployments: { where: { returnedAt: null }, include: { trailer: true } },
    },
  });
  if (!subscription) return { ok: false, error: "Subscription not found" };
  if (subscription.status === "ENDED") {
    return { ok: false, error: "Already ended" };
  }

  // Cancel in Stripe first so we never bill after ending locally.
  if (subscription.stripeSubscriptionId) {
    const stripe = getStripe();
    if (stripe) {
      try {
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId, {
          invoice_now: true,
          prorate: true,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Unknown Stripe error";
        // Already-canceled in Stripe shouldn't block local cleanup.
        if (!msg.includes("canceled")) {
          return { ok: false, error: `Stripe error: ${msg}` };
        }
      }
    }
  }

  const now = new Date();
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.subscription.update({
      where: { id },
      data: { status: "ENDED", endedAt: now, endReason, endNotes },
    }),
    prisma.trailerDeployment.updateMany({
      where: { subscriptionId: id, returnedAt: null },
      data: { returnedAt: now },
    }),
  ];
  const trailerIds = subscription.deployments.map((d) => d.trailerId);
  if (trailerIds.length > 0) {
    ops.push(
      prisma.trailer.updateMany({
        where: { id: { in: trailerIds } },
        data: { status: "AVAILABLE" },
      })
    );
  }
  if (subscription.projectId && endReason === "PROJECT_COMPLETED") {
    ops.push(
      prisma.project.update({
        where: { id: subscription.projectId },
        data: { status: "COMPLETED" },
      })
    );
  }
  ops.push(
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: `Subscription ended — ${endReason.replace(/_/g, " ")}${
          endNotes ? `: ${endNotes}` : ""
        }. ${
          trailerIds.length
            ? `Returned units: ${subscription.deployments
                .map((d) => d.trailer.unitNumber)
                .join(", ")}.`
            : ""
        }`,
        authorId: session.user.id,
        subscriptionId: id,
      },
    })
  );
  await prisma.$transaction(ops);

  revalidatePath("/subscriptions");
  revalidatePath(`/subscriptions/${id}`);
  revalidatePath("/fleet");
  return { ok: true };
}

// Deploy additional trailers onto a running subscription, optionally
// increasing the recurring billing by a per-unit rate.
export async function deployTrailers(
  subscriptionId: string,
  trailerIds: string[],
  billing?: { unitRate: number } | null
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };
  if (trailerIds.length === 0)
    return { ok: false, error: "Select at least one trailer" };
  if (billing && !(billing.unitRate >= 0)) {
    return { ok: false, error: "Invalid per-unit rate" };
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!subscription || subscription.status === "ENDED") {
    return { ok: false, error: "Subscription is not active" };
  }

  const trailers = await prisma.trailer.findMany({
    where: { id: { in: trailerIds } },
  });
  const unavailable = trailers.filter((t) => t.status !== "AVAILABLE");
  if (unavailable.length > 0) {
    return {
      ok: false,
      error: `Not available: ${unavailable.map((t) => t.unitNumber).join(", ")}`,
    };
  }

  const increase = billing ? billing.unitRate * trailerIds.length : 0;
  let billingNote = "";

  // Push the increase to Stripe first (prorated from today).
  if (increase > 0 && subscription.stripeSubscriptionId) {
    const stripe = getStripe();
    if (stripe && subscription.billingCycle !== "ONE_TIME") {
      try {
        const product = await stripe.products.create({
          name: `Additional trailer rental (x${trailerIds.length})`,
        });
        await stripe.subscriptionItems.create({
          subscription: subscription.stripeSubscriptionId,
          quantity: trailerIds.length,
          price_data: {
            currency: "usd",
            unit_amount: toCents(billing!.unitRate),
            recurring:
              STRIPE_INTERVALS[
                subscription.billingCycle as Exclude<
                  typeof subscription.billingCycle,
                  "ONE_TIME"
                >
              ],
            product: product.id,
          },
          proration_behavior: "create_prorations",
        });
        billingNote = " Stripe subscription item added with proration.";
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown Stripe error";
        return { ok: false, error: `Stripe error: ${msg}` };
      }
    }
  }

  const newCycleAmount = Number(subscription.cycleAmount) + increase;
  const ops: Prisma.PrismaPromise<unknown>[] = [
    ...trailerIds.map((trailerId) =>
      prisma.trailerDeployment.create({
        data: { trailerId, subscriptionId },
      })
    ),
    prisma.trailer.updateMany({
      where: { id: { in: trailerIds } },
      data: { status: "DEPLOYED" },
    }),
  ];
  if (increase > 0) {
    ops.push(
      prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          cycleAmount: newCycleAmount,
          mrr:
            Math.round(
              toMonthly(newCycleAmount, subscription.billingCycle) * 100
            ) / 100,
        },
      })
    );
  }
  ops.push(
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: `Deployed additional units: ${trailers
          .map((t) => t.unitNumber)
          .join(", ")}.${
          increase > 0
            ? ` Billing increased by ${trailerIds.length} x $${billing!.unitRate.toFixed(2)} to $${newCycleAmount.toFixed(2)} per cycle.${billingNote}`
            : " Billing unchanged."
        }`,
        authorId: session.user.id,
        subscriptionId,
      },
    })
  );
  await prisma.$transaction(ops);

  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/fleet");
  return { ok: true };
}

// Manual billing correction (e.g. after returning units mid-term). Updates
// app records; when a Stripe subscription exists its items must currently be
// adjusted in the Stripe dashboard to match.
export async function adjustSubscriptionBilling(
  subscriptionId: string,
  newCycleAmount: number,
  note?: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };
  if (!(newCycleAmount >= 0)) return { ok: false, error: "Invalid amount" };

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!subscription || subscription.status === "ENDED") {
    return { ok: false, error: "Subscription is not active" };
  }

  const old = Number(subscription.cycleAmount);
  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        cycleAmount: newCycleAmount,
        mrr:
          Math.round(
            toMonthly(newCycleAmount, subscription.billingCycle) * 100
          ) / 100,
      },
    }),
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: `Billing adjusted from $${old.toFixed(2)} to $${newCycleAmount.toFixed(2)} per cycle${
          note ? ` — ${note}` : ""
        }.${
          subscription.stripeSubscriptionId
            ? " Reminder: update the Stripe subscription to match."
            : ""
        }`,
        authorId: session.user.id,
        subscriptionId,
      },
    }),
  ]);

  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/subscriptions");
  return { ok: true };
}
