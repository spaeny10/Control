-- Take ownership of invoicing. Invoice stops being a mirror of a Stripe invoice
-- and becomes the source of truth: our number, our line items, our schedule.
-- Stripe is only involved when a customer asks to pay by card.
--
-- Safe to restructure destructively here: there are zero Invoice rows and zero
-- subscriptions carrying a stripeSubscriptionId, so nothing live exists yet.
-- This is the last moment that's true.

-- CreateEnum
CREATE TYPE "InvoiceLineKind" AS ENUM ('RENT', 'ONE_TIME', 'TAX', 'CONVENIENCE_FEE', 'CREDIT', 'ADJUSTMENT');

-- AlterTable: our number becomes required and unique; the Stripe id becomes
-- optional, because most invoices will never have one.
--
-- The existing unique index is left alone deliberately: dropping NOT NULL does
-- not invalidate it, and Postgres treats NULLs as distinct in a unique index, so
-- any number of invoices can have no Stripe id while real ids stay unique.
ALTER TABLE "Invoice" ALTER COLUMN "stripeInvoiceId" DROP NOT NULL;

-- No rows exist, so a plain NOT NULL is safe without a backfill.
ALTER TABLE "Invoice" ALTER COLUMN "number" SET NOT NULL;
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- AlterTable: distinguishes "raised" from "emailed" so a run never sends twice.
ALTER TABLE "Invoice" ADD COLUMN     "sentAt" TIMESTAMP(3);

-- AlterTable: the billing schedule we now own. The anchor is the delivery date
-- rather than the signup date, and lastInvoicedThrough is the high-water mark
-- that makes a billing run idempotent.
ALTER TABLE "Subscription" ADD COLUMN     "billingAnchor" TIMESTAMP(3),
ADD COLUMN     "nextInvoiceDate" TIMESTAMP(3),
ADD COLUMN     "lastInvoicedThrough" TIMESTAMP(3),
ADD COLUMN     "minimumTermDays" INTEGER;

-- CreateTable: invoices were previously only totals, so nothing could itemise
-- rent against tax against a fee.
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "InvoiceLineKind" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "planProductId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");
CREATE INDEX "InvoiceLineItem_planProductId_idx" ON "InvoiceLineItem"("planProductId");

-- Finding what a billing run owes.
CREATE INDEX "Subscription_nextInvoiceDate_idx" ON "Subscription"("nextInvoiceDate");

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_planProductId_fkey" FOREIGN KEY ("planProductId") REFERENCES "PlanProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
