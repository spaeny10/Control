-- AlterTable
ALTER TABLE "GmailSyncState" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "syncLockedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "GmailSyncState_watchExpiration_idx" ON "GmailSyncState"("watchExpiration");
