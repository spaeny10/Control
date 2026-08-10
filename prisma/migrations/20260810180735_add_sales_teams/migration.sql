-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "salespersonId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "salesTeamId" TEXT;

-- CreateTable
CREATE TABLE "SalesTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesTeam_name_key" ON "SalesTeam"("name");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_salesTeamId_fkey" FOREIGN KEY ("salesTeamId") REFERENCES "SalesTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
