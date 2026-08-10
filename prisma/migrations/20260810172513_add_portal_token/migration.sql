-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "portalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_portalToken_key" ON "Company"("portalToken");
