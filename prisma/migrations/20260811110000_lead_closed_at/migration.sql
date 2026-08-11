-- Close timestamp so win rate can be windowed to a date range. `updatedAt`
-- moves on any edit, so it can't answer "was this won in the last 6 months".

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "closedAt" TIMESTAMP(3);

-- Backfill existing closed leads. updatedAt is a proxy, not the truth, but
-- it's the only close signal that exists for rows closed before this column
-- did — and leaving them null would silently drop all history from the rate.
UPDATE "Lead" SET "closedAt" = "updatedAt" WHERE "stage" IN ('WON', 'LOST');

-- CreateIndex: the windowed win-rate query filters on it.
CREATE INDEX "Lead_closedAt_idx" ON "Lead"("closedAt");
