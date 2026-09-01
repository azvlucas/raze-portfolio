-- AlterTable
ALTER TABLE "products" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "products_companyId_expiresAt_idx" ON "products"("companyId", "expiresAt");
