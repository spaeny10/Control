-- Split the single contact slot into the three roles a rental actually has:
-- the site/ops contact, accounts payable, and the delivery address (which lives
-- on Project and is what sales tax is sourced from, since rental equipment is
-- taxed where it sits).
--
-- The existing Quote.contact relation only gains a Prisma relation NAME, which
-- is client-side disambiguation — the column and FK constraint are unchanged,
-- so nothing here touches existing data.

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "billingContactId" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "billingContactId" TEXT,
ADD COLUMN     "siteContactId" TEXT;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_billingContactId_fkey" FOREIGN KEY ("billingContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_billingContactId_fkey" FOREIGN KEY ("billingContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_siteContactId_fkey" FOREIGN KEY ("siteContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Quote_billingContactId_idx" ON "Quote"("billingContactId");
CREATE INDEX "Subscription_billingContactId_idx" ON "Subscription"("billingContactId");
CREATE INDEX "Subscription_siteContactId_idx" ON "Subscription"("siteContactId");

-- Backfill: where a company has a designated AP contact, seed it as the
-- billing contact on quotes that don't have one. Existing quotes kept whichever
-- single contact was chosen, so this recovers the AP link without guessing.
UPDATE "Quote" q
SET "billingContactId" = c."id"
FROM "Contact" c
WHERE c."companyId" = q."companyId"
  AND c."isBillingContact" = true
  AND q."billingContactId" IS NULL;
