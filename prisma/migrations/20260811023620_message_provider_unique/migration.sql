-- DropIndex
DROP INDEX "Message_providerMessageId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Message_providerMessageId_key" ON "Message"("providerMessageId");
