-- Record HOW a quote was accepted, so acceptances taken by phone or on a signed
-- PDF can unblock conversion without masquerading as an online signature.

-- CreateEnum
CREATE TYPE "QuoteAcceptanceMethod" AS ENUM ('ONLINE', 'PHONE', 'EMAIL', 'SIGNED_DOCUMENT', 'IN_PERSON');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "acceptedVia" "QuoteAcceptanceMethod",
ADD COLUMN     "acceptedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Quote_acceptedByUserId_idx" ON "Quote"("acceptedByUserId");

-- Anything already accepted can only have come through the public link, since
-- that was the sole path until now.
UPDATE "Quote" SET "acceptedVia" = 'ONLINE' WHERE "status" = 'ACCEPTED';
