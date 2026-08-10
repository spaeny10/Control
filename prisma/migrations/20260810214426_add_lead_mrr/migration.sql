-- Leads split value into MRR + expected months + total contract value.
ALTER TABLE "Lead" ADD COLUMN     "estMrr" DECIMAL(12,2);
ALTER TABLE "Lead" ADD COLUMN     "estMonths" INTEGER;

-- Backfill: existing estValue was a total. Assume a 6-month rental so the
-- split is coherent; reps can correct individual leads.
UPDATE "Lead"
SET "estMonths" = 6,
    "estMrr" = ROUND("estValue" / 6, 2)
WHERE "estValue" IS NOT NULL;
