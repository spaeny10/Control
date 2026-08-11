-- Sales tax via TaxCloud, sourced from the jobsite because rental equipment is
-- taxed where it sits.

-- AlterTable: taxability is per product, set in the price catalog. Null means
-- nobody has classified it yet, which is different from "not taxable".
ALTER TABLE "PlanProduct" ADD COLUMN     "tic" INTEGER;

-- AlterTable: the tax we calculated, plus the TaxCloud handles needed to report
-- it. taxReportedAt is set on payment, not on invoicing, because filing is
-- cash-basis here.
ALTER TABLE "Invoice" ADD COLUMN     "taxAmount" DECIMAL(12,2),
ADD COLUMN     "taxCloudCartId" TEXT,
ADD COLUMN     "taxCloudOrderId" TEXT,
ADD COLUMN     "taxReportedAt" TIMESTAMP(3),
ADD COLUMN     "taxNeedsReview" BOOLEAN NOT NULL DEFAULT false;

-- Finding invoices whose tax hasn't reached a filing yet, and the review queue.
CREATE INDEX "Invoice_taxReportedAt_idx" ON "Invoice"("taxReportedAt");
CREATE INDEX "Invoice_taxNeedsReview_idx" ON "Invoice"("taxNeedsReview");
