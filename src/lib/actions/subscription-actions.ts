"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { toMonthly } from "@/lib/cycles";
import { activateSubscription, isDueBy } from "@/lib/activation";
import { raiseUntilCaughtUp } from "@/lib/billing";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";
import type { Prisma, SubscriptionEndReason } from "@prisma/client";

const convertSchema = z.object({
  quoteId: z.string().min(1),
  trailerIds: z.array(z.string()).min(0),
  startDate: z.string().optional(),
  /* Whether the signed terms offer card payment, and the surcharge that comes
     with it. Default is check/ACH only, which is how most of this business
     collects. */
  cardPaymentAllowed: z.boolean().optional(),
  convenienceFeePct: z.number().min(0).max(100).optional(),
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
  const cardPaymentAllowed = parsed.data.cardPaymentAllowed ?? false;
  const convenienceFeePct = cardPaymentAllowed
    ? (parsed.data.convenienceFeePct ?? null)
    : null;

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      company: true,
      contact: true,
      billingContact: true,
      lineItems: true,
      subscriptions: true,
      lead: { select: { ownerId: true, stage: true, estMonths: true } },
      project: {
        select: {
          id: true,
          name: true,
          expectedStart: true,
          expectedEnd: true,
          siteStreet: true,
          siteCity: true,
          siteState: true,
          siteZip: true,
        },
      },
    },
  });
  if (!quote) return { ok: false, error: "Quote not found" };
  if (quote.status !== "ACCEPTED") {
    return { ok: false, error: "Quote must be accepted before conversion" };
  }
  if (quote.subscriptions.length > 0) {
    return { ok: false, error: "Quote already converted" };
  }

  /* Sales tax on rental equipment is sourced to where the equipment sits, so a
     complete delivery address is a billing prerequisite, not a nice-to-have.
     Street and ZIP specifically — city/state alone can't resolve local rates. */
  const p = quote.project;
  const missingSite = !p
    ? "this quote isn't linked to a job"
    : [
        !p.siteStreet && "street",
        !p.siteCity && "city",
        !p.siteState && "state",
        !p.siteZip && "ZIP",
      ]
        .filter(Boolean)
        .join(", ");
  if (missingSite) {
    return {
      ok: false,
      error: !p
        ? "This quote isn't linked to a job, so there's no delivery address to bill tax against. Link a job on the quote first."
        : `The delivery address is missing ${missingSite}. Sales tax is charged where the trailers sit, so add it under Site & schedule before converting.`,
    };
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
  let billingNote =
    "Billing: Stripe not connected — invoices must be handled manually until keys are configured.";

  if (stripe) {
    try {
      /* Invoices must reach accounts payable, not the site contact. Most
         payments here arrive as checks, so an invoice emailed to the project
         manager is a slow-paying invoice for a reason nobody thinks to check.
         Falls back to the site contact only if no AP contact is set. */
      const invoiceEmail =
        quote.billingContact?.email ?? quote.contact?.email ?? undefined;
      const billingAddress = {
        line1: quote.company.billingStreet ?? undefined,
        city: quote.company.billingCity ?? undefined,
        state: quote.company.billingState ?? undefined,
        postal_code: quote.company.billingZip ?? undefined,
        country: "US",
      };
      /* Shipping is the jobsite. Whatever computes tax — Stripe Tax or an
         external service like TaxCloud — sources the rate from here, because
         rental equipment is taxed where it sits, not where the office is. */
      const shipping = {
        name: quote.company.name,
        phone: quote.contact?.phone ?? undefined,
        address: {
          line1: p!.siteStreet!,
          city: p!.siteCity!,
          state: p!.siteState!,
          postal_code: p!.siteZip!,
          country: "US",
        },
      };

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          name: quote.company.name,
          email: invoiceEmail,
          address: billingAddress,
          shipping,
          metadata: { companyId: quote.company.id },
        });
        stripeCustomerId = customer.id;
        await prisma.company.update({
          where: { id: quote.company.id },
          data: { stripeCustomerId },
        });
      } else {
        /* Keep the existing customer current. NOTE: one Stripe customer per
           company means one shipping address, so a contractor running jobs in
           two tax jurisdictions will have both invoices sourced from whichever
           site was written last. Correct handling needs a customer per site (or
           per-invoice addresses) — deliberately unresolved, see the roadmap. */
        await stripe.customers.update(stripeCustomerId, {
          email: invoiceEmail,
          address: billingAddress,
          shipping,
        });
      }

      /* No Stripe Subscription: the app raises every invoice on its own
         schedule now (src/lib/billing.ts). Creating one here as well would mean
         Stripe invoicing the customer in parallel the moment keys were added —
         double billing. Stripe keeps only the customer record, which a
         card-payment invoice needs later. */
      billingNote =
        "Billing: invoices are raised by the app; Stripe customer kept for card payments.";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown Stripe error";
      return { ok: false, error: `Stripe error: ${msg}` };
    }
  }

  // ---- Local records ----
  /* Activation (billing start) is independent of delivery. Units are only
     ASSIGNED here — they're still in the yard until a driver completes the
     delivery job, which may happen weeks before or after billing starts.

     The activation date is optional:
       - today or earlier → active now, first invoice goes out today
       - a future date   → PENDING; the billing run activates it that morning
       - none            → PENDING until someone clicks Activate
     Commission attribution and everything else is the same either way. */
  // A bare yyyy-MM-dd parses as UTC midnight — the previous evening in the
  // US, which would put the billing anchor a day early.
  const activationDate = startDate ? new Date(`${startDate}T09:00:00`) : null;
  if (activationDate && Number.isNaN(activationDate.getTime())) {
    return { ok: false, error: "Invalid billing start date" };
  }
  const activateNow = activationDate !== null && isDueBy(activationDate);

  const subscription = await prisma.subscription.create({
    data: {
      status: "PENDING",
      // Placeholder until activation sets the real start; startDate is required.
      startDate: activationDate ?? new Date(),
      billingCycle,
      cycleAmount,
      mrr,
      companyId: quote.companyId,
      projectId: quote.projectId,
      quoteId: quote.id,
      // Copied so they can change over a long rental without editing the quote.
      billingContactId: quote.billingContactId,
      siteContactId: quote.contactId,
      cardPaymentAllowed,
      convenienceFeePct,
      // A scheduled activation is a PENDING subscription with these set.
      billingAnchor: activationDate,
      nextInvoiceDate: activationDate,
      // Commission attribution: the lead owner won this; fall back to
      // whoever converted the quote.
      salespersonId: quote.lead?.ownerId ?? session.user.id,
      deployments: {
        // deliveredAt stays null: on the contract, not yet on site.
        create: trailerIds.map((trailerId) => ({ trailerId })),
      },
    },
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (trailerIds.length > 0) {
    ops.push(
      prisma.trailer.updateMany({
        where: { id: { in: trailerIds } },
        data: { status: "ASSIGNED" },
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
        body: `Subscription created from quote ${quote.number}. Units assigned: ${
          trailers.map((t) => t.unitNumber).join(", ") || "none yet"
        } — schedule a delivery to put them on site. ${
          activateNow
            ? "Billing activates today."
            : activationDate
              ? `Billing scheduled to activate ${activationDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
              : "Billing pending — activate when the job starts."
        } ${billingNote}`,
        authorId: session.user.id,
        subscriptionId: subscription.id,
      },
    })
  );
  await prisma.$transaction(ops);

  /* Activating today means the first invoice goes out today, matching the rule
     that the first bill goes on the activation date. Failure-isolated: if the
     invoice can't be raised now the billing run picks it up, so a hiccup here
     must not fail a conversion that has already been recorded. */
  if (activateNow && activationDate) {
    await activateSubscription(subscription.id, activationDate, session.user.id);
    try {
      await raiseUntilCaughtUp(subscription.id);
    } catch (err) {
      console.error("[convert] first invoice deferred to billing run:", err);
    }
  }

  revalidatePath("/subscriptions");
  revalidatePath("/fleet");
  revalidatePath("/dispatch");
  revalidatePath("/leads");
  revalidatePath(`/quotes/${quote.id}`);
  return { ok: true, id: subscription.id };
}

// End a subscription with a required reason. PROJECT_COMPLETED is natural
// roll-off; the rest count as churn in KPIs.
//
// Ending BILLING is not the same as the units coming home. Units a driver has
// delivered stay on site — and DEPLOYED — until a pickup job brings them back,
// which puts them at the top of Dispatch's pickup queue. Units that were only
// assigned never left the yard, so they're released straight back to available.
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

  const now = new Date();
  const neverDelivered = subscription.deployments.filter((d) => !d.deliveredAt);
  const stillOnSite = subscription.deployments.filter((d) => d.deliveredAt);

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.subscription.update({
      where: { id },
      data: { status: "ENDED", endedAt: now, endReason, endNotes },
    }),
  ];
  if (neverDelivered.length > 0) {
    ops.push(
      prisma.trailerDeployment.updateMany({
        where: { id: { in: neverDelivered.map((d) => d.id) } },
        data: { returnedAt: now },
      }),
      prisma.trailer.updateMany({
        where: { id: { in: neverDelivered.map((d) => d.trailerId) } },
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
  const units = (ds: typeof stillOnSite) =>
    ds.map((d) => d.trailer.unitNumber).join(", ");
  ops.push(
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: [
          `Billing ended — ${endReason.replace(/_/g, " ")}${
            endNotes ? `: ${endNotes}` : ""
          }.`,
          neverDelivered.length
            ? `Released (never delivered): ${units(neverDelivered)}.`
            : "",
          stillOnSite.length
            ? `Still on site, awaiting pickup: ${units(stillOnSite)}.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        authorId: session.user.id,
        subscriptionId: id,
      },
    })
  );
  await prisma.$transaction(ops);

  revalidatePath("/subscriptions");
  revalidatePath(`/subscriptions/${id}`);
  revalidatePath("/fleet");
  revalidatePath("/dispatch");
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

  /* The increase lands in cycleAmount, which the billing run reconciles against
     the quote lines on the next invoice as an explicit adjustment line. No
     Stripe call: the app owns the schedule. */
  const newCycleAmount = Number(subscription.cycleAmount) + increase;
  const ops: Prisma.PrismaPromise<unknown>[] = [
    // Assigned to the job, still in the yard — a delivery job puts them on site.
    ...trailerIds.map((trailerId) =>
      prisma.trailerDeployment.create({
        data: { trailerId, subscriptionId },
      })
    ),
    prisma.trailer.updateMany({
      where: { id: { in: trailerIds } },
      data: { status: "ASSIGNED" },
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
        body: `Assigned additional units: ${trailers
          .map((t) => t.unitNumber)
          .join(", ")} — schedule a delivery to put them on site.${
          increase > 0
            ? ` Billing increased by ${trailerIds.length} x $${billing!.unitRate.toFixed(2)} to $${newCycleAmount.toFixed(2)} per cycle from the next invoice.`
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
  revalidatePath("/dispatch");
  return { ok: true };
}

/* Start billing now (or on a backdated day). A future date schedules instead:
   the billing run activates it that morning. Raising the first invoice right
   away keeps the "first bill on activation day" rule true for a manual click,
   not just for the overnight run. */
export async function activateSubscriptionAction(
  subscriptionId: string,
  dateInput?: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const date = dateInput ? new Date(`${dateInput}T09:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Invalid date" };

  if (!isDueBy(date)) return scheduleActivation(subscriptionId, dateInput!);

  const result = await activateSubscription(subscriptionId, date, session.user.id);
  if (!result.ok) return { ok: false, error: result.reason };
  try {
    await raiseUntilCaughtUp(subscriptionId);
  } catch (err) {
    console.error("[activate] remaining invoices deferred to billing run:", err);
  }

  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/subscriptions");
  revalidatePath("/");
  return { ok: true };
}

/* Set, move, or clear a future activation date on a PENDING subscription. A
   job slipping is common, so this is how someone pushes the date before an
   invoice goes out. */
export async function scheduleActivation(
  subscriptionId: string,
  dateInput: string | null
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: { status: true },
  });
  if (!sub) return { ok: false, error: "Subscription not found" };
  if (sub.status !== "PENDING") {
    return { ok: false, error: "Billing has already started" };
  }

  const date = dateInput ? new Date(`${dateInput}T09:00:00`) : null;
  if (date && Number.isNaN(date.getTime())) {
    return { ok: false, error: "Invalid date" };
  }

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscriptionId },
      data: { billingAnchor: date, nextInvoiceDate: date },
    }),
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: date
          ? `Billing scheduled to activate ${date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}.`
          : "Scheduled activation cleared — billing waits for a manual Activate.",
        authorId: session.user.id,
        subscriptionId,
      },
    }),
  ]);

  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/");
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
