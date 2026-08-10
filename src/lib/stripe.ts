import Stripe from "stripe";

// Returns null when Stripe isn't configured yet — billing flows degrade to
// local-only records with a chatter note instead of failing.
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}
