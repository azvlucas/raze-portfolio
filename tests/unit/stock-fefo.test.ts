import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../src/lib/prisma";
import {
  adjustStock,
  allocateFefo,
  stockOutFefo,
} from "../../src/modules/stock/stock.service";
import { toNumber } from "../../src/lib/money";

/**
 * Integration-style unit tests against the local DB.
 * Requires migrate + seed already applied.
 */
describe("stock FEFO and guards", () => {
  let companyId = "";
  let userId = "";
  let productId = "";
  let productNoExpiry = "";

  beforeAll(async () => {
    const company = await prisma.company.findFirst();
    const user = await prisma.user.findFirst({ where: { active: true } });
    const withExpiry = await prisma.product.findFirst({
      where: { trackExpiry: true, active: true },
    });
    const noExpiry = await prisma.product.findFirst({
      where: { trackExpiry: false, active: true },
    });
    if (!company || !user || !withExpiry || !noExpiry) {
      throw new Error("Seed data missing — run prisma db seed");
    }
    companyId = company.id;
    userId = user.id;
    productId = withExpiry.id;
    productNoExpiry = noExpiry.id;

    // reset stock for isolation
    await prisma.stockMovement.deleteMany({
      where: { productId: { in: [productId, productNoExpiry] } },
    });
    await prisma.batch.deleteMany({
      where: { productId: { in: [productId, productNoExpiry] } },
    });
    await prisma.product.updateMany({
      where: { id: { in: [productId, productNoExpiry] } },
      data: { currentStock: 0 },
    });
  });

  it("enters stock with batches and sells FEFO", async () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 6);
    const sooner = new Date();
    sooner.setMonth(sooner.getMonth() + 2);

    await adjustStock(companyId, userId, {
      productId,
      quantity: 10,
      type: "ADJUST_IN",
      reason: "Entrada teste lote A",
      batchCode: "FEFO-A",
      expiresAt: future.toISOString().slice(0, 10),
    });

    await adjustStock(companyId, userId, {
      productId,
      quantity: 5,
      type: "ADJUST_IN",
      reason: "Entrada teste lote B",
      batchCode: "FEFO-B",
      expiresAt: sooner.toISOString().slice(0, 10),
    });

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(toNumber(product.currentStock)).toBe(15);

    await prisma.$transaction(async (tx) => {
      const alloc = await allocateFefo(productId, 6, tx);
      // should take from FEFO-B (sooner) first (5) then FEFO-A (1)
      expect(alloc).toHaveLength(2);
      expect(alloc[0].qty).toBe(5);
      expect(alloc[1].qty).toBe(1);

      await stockOutFefo(
        {
          productId,
          quantity: 6,
          type: "SALE_OUT",
          originType: "Test",
          originId: "test-1",
          userId,
          reason: "Venda FEFO",
        },
        tx,
      );
    });

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(toNumber(after.currentStock)).toBe(9);

    const batchB = await prisma.batch.findFirst({
      where: { productId, code: "FEFO-B" },
    });
    expect(toNumber(batchB!.qtyAvailable)).toBe(0);
  });

  it("blocks negative stock", async () => {
    await expect(
      adjustStock(companyId, userId, {
        productId: productNoExpiry,
        quantity: 1000,
        type: "ADJUST_OUT",
        reason: "tentativa negativa",
      }),
    ).rejects.toThrow(/insuficiente|negativo/i);
  });

  it("blocks sale of only-expired batches via FEFO", async () => {
    // clear and add only expired batch
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.batch.deleteMany({ where: { productId } });
    await prisma.product.update({
      where: { id: productId },
      data: { currentStock: 0 },
    });

    const past = new Date();
    past.setFullYear(past.getFullYear() - 1);

    // force create expired batch + stock without going through sale path
    await prisma.$transaction(async (tx) => {
      await tx.batch.create({
        data: {
          productId,
          code: "EXPIRED-ONLY",
          expiresAt: past,
          qtyReceived: 4,
          qtyAvailable: 4,
        },
      });
      await tx.product.update({
        where: { id: productId },
        data: { currentStock: 4 },
      });
    });

    await expect(
      prisma.$transaction(async (tx) =>
        allocateFefo(productId, 1, tx),
      ),
    ).rejects.toThrow(/insuficientes|vencidos/i);
  });
});
