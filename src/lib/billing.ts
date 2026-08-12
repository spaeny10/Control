import {
  addDays,
  addMonths,
  differenceInCalendarMonths,
  startOfDay,
  endOfDay,
} from "date-fns";
import type { BillingCycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withInvoiceNumber } from "@/lib/invoice-number";
import { calculateTax, commitOrder, isTaxCloudConfigured } from "@/lib/taxcloud";

/* The billing engine. We own the schedule; Stripe is only a card rail.

   Rent is billed IN ADVANCE: the first invoice goes out the day the
   subscription activates and covers that period, so every invoice is raised on
   the first day of the period it pays for.

   Idempotency is lastInvoicedThrough — a high-water mark. A period is only
   billable when its end is beyond that mark, so re-running the job, or running
   it twice concurrently, cannot double-bill. That matters more than usual here
   because the run is scheduled: nobody is watching it happen. */

/** General tangible personal property — used when a line has no catalog product. */
const DEFAULT_TIC = 0;

/* The bill goes out on the same day of the month the billing started — an
   anchor-day schedule. That makes MONTHLY the one cycle that can't be computed
   from the previous boundary: chaining addMonths from Jan 31 gives Feb 28 and
   then Mar 28, silently drifting the bill day to the 28th forever. Computing
   every boundary from the ANCHOR instead means Feb clamps to the 28th (it has
   no 31st) but March snaps back to the 31st. Fixed-length cycles don't have
   this problem and roll from the previous boundary as before. */
export function periodEndFor(
  start: Date,
  cycle: BillingCycle,
  anchor?: Date | null
): Date {
  switch (cycle) {
    case "DAILY":
      return addDays(start, 1);
    case "WEEKLY":
      return addDays(start, 7);
    case "EVERY_28_DAYS":
      return addDays(start, 28);
    case "MONTHLY": {
      if (!anchor) return addMonths(start, 1);
      let months = differenceInCalendarMonths(start, anchor) + 1;
      let end = addMonths(anchor, months);
      // Safety: a hand-edited nextInvoiceDate could land where one hop back
      // from the anchor isn't past the start. Never emit an empty period.
      while (end <= start) end = addMonths(anchor, ++months);
      return end;
    }
    default:
      // ONE_TIME never recurs; treat as a single day so callers can't loop.
      return addDays(start, 1);
  }
}

export type DueInvoice = {
  subscriptionId: string;
  company: string;
  jobName: string | null;
  periodStart: Date;
  periodEnd: Date;
  cycleAmount: number;
  daysLate: number;
};

/* What the next run owes. Also drives the Accounting dashboard card, because a
   scheduled job that silently stops is the main risk of owning billing — an
   unbilled cycle is invisible unless something shows it. */
export async function getDueInvoiceQueue(asOf = new Date()): Promise<DueInvoice[]> {
  const today = startOfDay(asOf);
  const due = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "PAST_DUE"] },
      /* Compared against the END of today, not the start. nextInvoiceDate
         carries a time — a subscription activated at 2pm has a 2pm anchor — and
         `lte: startOfDay` would exclude it until tomorrow. That would miss the
         first invoice on activation day, which is precisely when it's supposed
         to go out. raiseInvoiceFor compares whole days, so the two would also
         disagree about what's due. */
      nextInvoiceDate: { not: null, lte: endOfDay(asOf) },
    },
    select: {
      id: true,
      cycleAmount: true,
      billingCycle: true,
      billingAnchor: true,
      nextInvoiceDate: true,
      company: { select: { name: true } },
      project: { select: { name: true } },
    },
    orderBy: { nextInvoiceDate: "asc" },
  });
  return due.map((s) => {
    const periodStart = s.nextInvoiceDate!;
    return {
      subscriptionId: s.id,
      company: s.company.name,
      jobName: s.project?.name ?? null,
      periodStart,
      periodEnd: periodEndFor(periodStart, s.billingCycle, s.billingAnchor),
      cycleAmount: Number(s.cycleAmount),
      daysLate: Math.max(
        0,
        Math.floor(
          (today.getTime() - startOfDay(periodStart).getTime()) / 86_400_000
        )
      ),
    };
  });
}

export type RaiseResult =
  | { ok: true; invoiceId: string; number: string; total: number }
  | { ok: false; reason: string };

/* Raise one invoice for the period starting at nextInvoiceDate.

   Line items come from the quote's recurring lines rather than from
   cycleAmount alone, because each carries a planProduct and therefore a TIC —
   tax can't be calculated from a single blended total. When the two disagree
   (a mid-term billing adjustment, or units added or removed), the difference is
   added as an explicit ADJUSTMENT line rather than silently scaling the rent,
   so the invoice still totals correctly and the divergence is visible. */
export async function raiseInvoiceFor(
  subscriptionId: string,
  asOf = new Date()
): Promise<RaiseResult> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      status: true,
      companyId: true,
      cycleAmount: true,
      billingCycle: true,
      billingAnchor: true,
      nextInvoiceDate: true,
      lastInvoicedThrough: true,
      paymentTermsDays: true,
      project: {
        select: {
          siteStreet: true,
          siteCity: true,
          siteState: true,
          siteZip: true,
        },
      },
      quote: {
        select: {
          lineItems: {
            orderBy: { sortOrder: "asc" },
            select: {
              cycle: true,
              description: true,
              quantity: true,
              unitPrice: true,
              planProductId: true,
              planProduct: { select: { tic: true } },
            },
          },
        },
      },
    },
  });
  if (!sub) return { ok: false, reason: "Subscription not found" };
  if (sub.status !== "ACTIVE" && sub.status !== "PAST_DUE") {
    return { ok: false, reason: `Subscription is ${sub.status}` };
  }
  if (!sub.nextInvoiceDate) {
    return { ok: false, reason: "No billing schedule set" };
  }
  if (startOfDay(sub.nextInvoiceDate) > startOfDay(asOf)) {
    return { ok: false, reason: "Not due yet" };
  }

  const periodStart = sub.nextInvoiceDate;
  const periodEnd = periodEndFor(periodStart, sub.billingCycle, sub.billingAnchor);

  // The high-water mark. Anything already covered is not billable again.
  if (sub.lastInvoicedThrough && sub.lastInvoicedThrough >= periodEnd) {
    return { ok: false, reason: "Period already invoiced" };
  }

  const isFirstInvoice = sub.lastInvoicedThrough === null;
  const quoteLines = sub.quote?.lineItems ?? [];
  const recurring = quoteLines.filter((l) => l.cycle !== "ONE_TIME");
  const oneTime = quoteLines.filter((l) => l.cycle === "ONE_TIME");

  type Draft = {
    kind: "RENT" | "ONE_TIME" | "TAX" | "ADJUSTMENT";
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    planProductId: string | null;
    tic: number;
    periodStart?: Date;
    periodEnd?: Date;
  };
  const lines: Draft[] = [];

  for (const l of recurring) {
    const unit = Number(l.unitPrice);
    lines.push({
      kind: "RENT",
      description: l.description,
      quantity: l.quantity,
      unitPrice: unit,
      amount: Math.round(l.quantity * unit * 100) / 100,
      planProductId: l.planProductId,
      tic: l.planProduct?.tic ?? DEFAULT_TIC,
      periodStart,
      periodEnd,
    });
  }

  /* Only the first invoice carries delivery and setup — they happen once, at
     the start of the rental. */
  if (isFirstInvoice) {
    for (const l of oneTime) {
      const unit = Number(l.unitPrice);
      lines.push({
        kind: "ONE_TIME",
        description: l.description,
        quantity: l.quantity,
        unitPrice: unit,
        amount: Math.round(l.quantity * unit * 100) / 100,
        planProductId: l.planProductId,
        tic: l.planProduct?.tic ?? DEFAULT_TIC,
      });
    }
  }

  // Reconcile against the subscription's authoritative current rent.
  const rentFromLines = lines
    .filter((l) => l.kind === "RENT")
    .reduce((s, l) => s + l.amount, 0);
  const currentRent = Number(sub.cycleAmount);
  const drift = Math.round((currentRent - rentFromLines) * 100) / 100;
  if (Math.abs(drift) >= 0.01) {
    lines.push({
      kind: "ADJUSTMENT",
      description:
        drift > 0
          ? "Billing adjustment — units or rate added since the quote"
          : "Billing adjustment — units or rate reduced since the quote",
      quantity: 1,
      unitPrice: drift,
      amount: drift,
      planProductId: null,
      tic: DEFAULT_TIC,
      periodStart,
      periodEnd,
    });
  }

  if (lines.length === 0) {
    return { ok: false, reason: "Nothing to bill" };
  }

  // ---- Sales tax, from the jobsite ----
  let taxTotal = 0;
  let taxCartId: string | null = null;
  let taxNeedsReview = false;
  const p = sub.project;
  const destination =
    p?.siteStreet && p.siteCity && p.siteState && p.siteZip
      ? { line1: p.siteStreet, city: p.siteCity, state: p.siteState, zip: p.siteZip }
      : null;

  if (isTaxCloudConfigured()) {
    if (!destination) {
      // Bill untaxed rather than hold the invoice, but make it visible.
      taxNeedsReview = true;
    } else {
      const taxable = lines.filter((l) => l.amount > 0);
      const calc = await calculateTax({
        destination,
        customerId: sub.companyId,
        lineItems: taxable.map((l, i) => ({
          itemId: `line-${i}`,
          price: l.amount,
          quantity: 1,
          tic: l.tic,
        })),
      });
      if (calc?.ok) {
        taxTotal = calc.quote.totalTax;
        taxCartId = calc.quote.cartId;
        // Zero is ambiguous: exempt, or a state we aren't registered in.
        taxNeedsReview = taxTotal === 0;
        if (taxTotal > 0) {
          lines.push({
            kind: "TAX",
            description: `Sales tax — ${destination.city}, ${destination.state} ${destination.zip}`,
            quantity: 1,
            unitPrice: taxTotal,
            amount: taxTotal,
            planProductId: null,
            tic: DEFAULT_TIC,
          });
        }
      } else {
        taxNeedsReview = true;
      }
    }
  }

  const total =
    Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;

  /* One transaction: the invoice, its lines, and the schedule advance. If any
     part fails, the subscription stays due and the next run retries — far
     better than an invoice that exists with the schedule already moved past it. */
  const created = await withInvoiceNumber((number) =>
    prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          number,
          status: "OPEN",
          amountDue: total,
          amountPaid: 0,
          taxAmount: taxTotal || null,
          taxCloudCartId: taxCartId,
          taxNeedsReview,
          periodStart,
          periodEnd,
          dueDate: addDays(periodStart, sub.paymentTermsDays),
          subscriptionId: sub.id,
          lineItems: {
            create: lines.map((l, i) => ({
              kind: l.kind,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              amount: l.amount,
              periodStart: l.periodStart,
              periodEnd: l.periodEnd,
              planProductId: l.planProductId,
              sortOrder: i,
            })),
          },
        },
        select: { id: true, number: true },
      });
      await tx.subscription.update({
        where: { id: sub.id },
        data: { lastInvoicedThrough: periodEnd, nextInvoiceDate: periodEnd },
      });
      await tx.message.create({
        data: {
          channel: "SYSTEM",
          body:
            `Invoice ${number} raised for ${periodStart.toDateString()} – ` +
            `${periodEnd.toDateString()}: $${total.toFixed(2)}` +
            (taxTotal > 0 ? ` (incl. $${taxTotal.toFixed(2)} tax)` : "") +
            `. Net ${sub.paymentTermsDays}.`,
          subscriptionId: sub.id,
        },
      });
      return invoice;
    })
  );

  /* Open the TaxCloud order uncommitted — cash-basis filing means it only
     counts once payment lands. Outside the transaction: a TaxCloud hiccup must
     not roll back a valid invoice. */
  if (taxCartId && taxTotal > 0) {
    const opened = await commitOrder({
      orderId: created.number,
      cartId: taxCartId,
      completed: false,
    });
    await prisma.invoice.update({
      where: { id: created.id },
      data: {
        taxCloudOrderId: opened?.ok ? created.number : null,
        taxNeedsReview: taxNeedsReview || !opened?.ok,
      },
    });
  }

  return { ok: true, invoiceId: created.id, number: created.number, total };
}

/** Raise everything due. Returns a per-subscription outcome for the run log. */
export async function runBilling(asOf = new Date()) {
  const queue = await getDueInvoiceQueue(asOf);
  const results: {
    subscriptionId: string;
    company: string;
    outcome: string;
  }[] = [];
  for (const item of queue) {
    try {
      const r = await raiseInvoiceFor(item.subscriptionId, asOf);
      results.push({
        subscriptionId: item.subscriptionId,
        company: item.company,
        outcome: r.ok ? `raised ${r.number} for $${r.total.toFixed(2)}` : r.reason,
      });
    } catch (err) {
      results.push({
        subscriptionId: item.subscriptionId,
        company: item.company,
        outcome: `error: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  }
  return { due: queue.length, results };
}
