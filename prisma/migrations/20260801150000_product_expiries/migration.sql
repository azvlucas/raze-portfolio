-- CreateTable
CREATE TABLE "product_expiries" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_expiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_expiries_productId_expiresAt_idx" ON "product_expiries"("productId", "expiresAt");

-- CreateIndex
CREATE INDEX "product_expiries_expiresAt_idx" ON "product_expiries"("expiresAt");

-- AddForeignKey
ALTER TABLE "product_expiries" ADD CONSTRAINT "product_expiries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migra validade única já cadastrada no produto para o histórico
INSERT INTO "product_expiries" ("id", "productId", "expiresAt", "notes", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  p.id,
  p."expiresAt",
  'Migrado da validade única do produto',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "products" p
WHERE p."expiresAt" IS NOT NULL;
