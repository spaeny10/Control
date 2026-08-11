-- Card payment is opt-in per subscription. Most customers remit by check, so
-- card is only offered when the signed terms say so — and when it is, it carries
-- a convenience fee. Where card isn't offered, the hosted invoice is restricted
-- so Stripe can't accept one and leave us with the processing cost.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cardPaymentAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "convenienceFeePct" DECIMAL(5,2);
