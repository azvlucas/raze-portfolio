-- AlterTable
ALTER TABLE "products" ADD COLUMN "markupPercent" DECIMAL(8,4) NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "SaleCostType" AS ENUM ('FIXED', 'PERCENT');

-- CreateTable
CREATE TABLE "sale_costs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "SaleCostType" NOT NULL DEFAULT 'FIXED',
    "value" DECIMAL(14,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_costs_companyId_active_idx" ON "sale_costs"("companyId", "active");
