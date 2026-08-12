-- Net terms belong to us now: we set the due date when we raise the invoice.
-- The old Stripe subscription path hardcoded days_until_due: 30, which quietly
-- contradicted the net 45 these customers are actually on.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "paymentTermsDays" INTEGER NOT NULL DEFAULT 45;
