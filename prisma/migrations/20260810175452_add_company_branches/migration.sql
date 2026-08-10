-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "parentCompanyId" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "isBillingContact" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CompanyPrice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planProductId" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "CompanyPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPrice_companyId_planProductId_key" ON "CompanyPrice"("companyId", "planProductId");

-- CreateIndex
CREATE INDEX "Company_parentCompanyId_idx" ON "Company"("parentCompanyId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_parentCompanyId_fkey" FOREIGN KEY ("parentCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPrice" ADD CONSTRAINT "CompanyPrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPrice" ADD CONSTRAINT "CompanyPrice_planProductId_fkey" FOREIGN KEY ("planProductId") REFERENCES "PlanProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
