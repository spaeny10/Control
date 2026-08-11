-- Two-track lead model (Phase 24).
--
-- HAND-WRITTEN ON PURPOSE. `prisma migrate diff` cannot tell a renamed enum
-- value from a delete-plus-add, so it would emit a destructive
-- create-new-type / cast / drop-old sequence against Lead.stage. RENAME VALUE
-- preserves the enum value's OID instead, so existing rows and the column
-- default both resolve to the new label with no table rewrite.

-- AlterEnum
ALTER TYPE "LeadStage" RENAME VALUE 'NEW' TO 'UNQUALIFIED';

-- AlterTable: make the new default explicit so schema and database agree visibly.
ALTER TABLE "Lead" ALTER COLUMN "stage" SET DEFAULT 'UNQUALIFIED';

-- AlterTable: provenance link from a spawned project lead back to the
-- organization lead that produced it.
ALTER TABLE "Lead" ADD COLUMN     "sourceLeadId" TEXT;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sourceLeadId_fkey" FOREIGN KEY ("sourceLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Lead_sourceLeadId_idx" ON "Lead"("sourceLeadId");

-- CreateIndex
CREATE INDEX "Lead_type_stage_idx" ON "Lead"("type", "stage");
