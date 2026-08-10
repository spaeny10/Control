-- CreateEnum
CREATE TYPE "DeploymentPhase" AS ENUM ('DELIVERY', 'RETURN');

-- AlterTable
ALTER TABLE "TrailerDeployment" ADD COLUMN     "deliverySignedAt" TIMESTAMP(3),
ADD COLUMN     "deliverySignedBy" TEXT,
ADD COLUMN     "returnSignedAt" TIMESTAMP(3),
ADD COLUMN     "returnSignedBy" TEXT;

-- CreateTable
CREATE TABLE "DeploymentPhoto" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "phase" "DeploymentPhase" NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentSignature" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "phase" "DeploymentPhase" NOT NULL,
    "data" BYTEA NOT NULL,
    "signedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeploymentPhoto_deploymentId_idx" ON "DeploymentPhoto"("deploymentId");

-- CreateIndex
CREATE INDEX "DeploymentSignature_deploymentId_idx" ON "DeploymentSignature"("deploymentId");

-- AddForeignKey
ALTER TABLE "DeploymentPhoto" ADD CONSTRAINT "DeploymentPhoto_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "TrailerDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentSignature" ADD CONSTRAINT "DeploymentSignature_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "TrailerDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
