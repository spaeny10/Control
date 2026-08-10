// Shared billing-cycle definitions used by catalog, quotes, subscriptions,
// and Stripe integration.
import type { BillingCycle } from "@prisma/client";

export const CYCLES: BillingCycle[] = [
  "DAILY",
  "WEEKLY",
  "EVERY_28_DAYS",
  "MONTHLY",
  "ONE_TIME",
];

export const RECURRING_CYCLES: BillingCycle[] = [
  "DAILY",
  "WEEKLY",
  "EVERY_28_DAYS",
  "MONTHLY",
];

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  ONE_TIME: "One-time",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  EVERY_28_DAYS: "28-day",
  MONTHLY: "Monthly",
};

// Short suffix rendered after an amount, e.g. "$450/day".
export const CYCLE_SUFFIX: Record<BillingCycle, string> = {
  ONE_TIME: "",
  DAILY: "/day",
  WEEKLY: "/wk",
  EVERY_28_DAYS: "/28 days",
  MONTHLY: "/mo",
};

// Average cycles per month, for normalizing everything to MRR.
export const CYCLES_PER_MONTH: Record<BillingCycle, number> = {
  ONE_TIME: 0,
  DAILY: 30.44,
  WEEKLY: 4.348,
  EVERY_28_DAYS: 1.087,
  MONTHLY: 1,
};

// Stripe recurring interval config per cycle.
export const STRIPE_INTERVALS: Record<
  Exclude<BillingCycle, "ONE_TIME">,
  { interval: "day" | "week" | "month"; interval_count: number }
> = {
  DAILY: { interval: "day", interval_count: 1 },
  WEEKLY: { interval: "week", interval_count: 1 },
  EVERY_28_DAYS: { interval: "day", interval_count: 28 },
  MONTHLY: { interval: "month", interval_count: 1 },
};

export function isRecurring(cycle: BillingCycle): boolean {
  return cycle !== "ONE_TIME";
}

export function toMonthly(amount: number, cycle: BillingCycle): number {
  return amount * CYCLES_PER_MONTH[cycle];
}
