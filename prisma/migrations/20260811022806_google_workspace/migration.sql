-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "googleEventId" TEXT;

-- AlterTable
ALTER TABLE "DeploymentPhoto" ADD COLUMN     "driveFileId" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DeploymentSignature" ADD COLUMN     "driveFileId" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DispatchJob" ADD COLUMN     "googleEventId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "providerThreadId" TEXT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "GmailSyncState" (
    "id" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "lastHistoryId" TEXT,
    "watchExpiration" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GmailSyncState_emailAddress_key" ON "GmailSyncState"("emailAddress");

-- CreateIndex
CREATE INDEX "Message_providerThreadId_idx" ON "Message"("providerThreadId");
