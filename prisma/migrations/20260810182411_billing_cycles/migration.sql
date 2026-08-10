-- Billing cycles: products get a price per cycle (daily/weekly/28-day/monthly),
-- quote lines and subscriptions carry a cycle. Data-preserving.

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('ONE_TIME', 'DAILY', 'WEEKLY', 'EVERY_28_DAYS', 'MONTHLY');

-- Per-cycle product prices
CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL,
    "planProductId" TEXT NOT NULL,
    "cycle" "BillingCycle" NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductPrice_planProductId_cycle_key" ON "ProductPrice"("planProductId", "cycle");

ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_planProductId_fkey" FOREIGN KEY ("planProductId") REFERENCES "PlanProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing single-price products into ProductPrice
INSERT INTO "ProductPrice" ("id", "planProductId", "cycle", "unitPrice")
SELECT "id" || '_p0',
       "id",
       CASE WHEN "kind" = 'RECURRING_MONTHLY' THEN 'MONTHLY'::"BillingCycle" ELSE 'ONE_TIME'::"BillingCycle" END,
       "unitPrice"
FROM "PlanProduct";

-- QuoteLineItem: kind -> cycle
ALTER TABLE "QuoteLineItem" ADD COLUMN "cycle" "BillingCycle";
UPDATE "QuoteLineItem" SET "cycle" = CASE WHEN "kind" = 'RECURRING_MONTHLY' THEN 'MONTHLY'::"BillingCycle" ELSE 'ONE_TIME'::"BillingCycle" END;
ALTER TABLE "QuoteLineItem" ALTER COLUMN "cycle" SET NOT NULL;
ALTER TABLE "QuoteLineItem" DROP COLUMN "kind";

-- PlanProduct: pricing moved to ProductPrice
ALTER TABLE "PlanProduct" DROP COLUMN "kind";
ALTER TABLE "PlanProduct" DROP COLUMN "unitPrice";
ALTER TABLE "PlanProduct" DROP COLUMN "stripePriceId";

-- CompanyPrice: negotiated rates become per-cycle (existing rows were monthly)
ALTER TABLE "CompanyPrice" ADD COLUMN "cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';
DROP INDEX "CompanyPrice_companyId_planProductId_key";
CREATE UNIQUE INDEX "CompanyPrice_companyId_planProductId_cycle_key" ON "CompanyPrice"("companyId", "planProductId", "cycle");

-- Subscription: billing cadence + per-cycle amount (existing subs were monthly)
ALTER TABLE "Subscription" ADD COLUMN "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "Subscription" ADD COLUMN "cycleAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE "Subscription" SET "cycleAmount" = "mrr";

-- Old enum retired
DROP TYPE "LineItemKind";
