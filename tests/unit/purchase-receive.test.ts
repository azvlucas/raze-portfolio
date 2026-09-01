import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../src/lib/prisma";
import {
  createPurchaseOrder,
  changePurchaseStatus,
  receivePurchase,
} from "../../src/modules/purchases/purchase.service";
import { toNumber } from "../../src/lib/money";

describe("purchase receive partial + stock", () => {
  let companyId = "";
  let userId = "";
  let supplierId = "";
  let productExpiryId = "";
  let productSimpleId = "";

  beforeAll(async () => {
    const company = await prisma.company.findFirst();
    const user = await prisma.user.findFirst({ where: { active: true } });
    const supplier = await prisma.supplier.findFirst({
      where: { active: true },
    });
    const withExpiry = await prisma.product.findFirst({
      where: { trackExpiry: true, active: true },
    });
    const noExpiry = await prisma.product.findFirst({
      where: { trackExpiry: false, active: true },
    });
    if (!company || !user || !supplier || !withExpiry || !noExpiry) {
      throw new Error("Seed incompleto");
    }
    companyId = company.id;
    userId = user.id;
    supplierId = supplier.id;
    productExpiryId = withExpiry.id;
    productSimpleId = noExpiry.id;
  });

  it("receives partially then fully and updates stock/cost", async () => {
    const order = await createPurchaseOrder(companyId, userId, {
      supplierId,
      expectedDate: null,
      paymentTerms: "28 dias",
      notes: "Teste E3",
      discountTotal: 0,
      freight: 10,
      otherExpenses: 0,
      items: [
        {
          productId: productExpiryId,
          quantity: 10,
          unitCost: 11.5,
          discount: 0,
        },
        {
          productId: productSimpleId,
          quantity: 4,
          unitCost: 20,
          discount: 0,
        },
      ],
    });

    expect(order?.status).toBe("DRAFT");
    expect(order!.grandTotal).toBe(11.5 * 10 + 20 * 4 + 10);

    await changePurchaseStatus(companyId, userId, order!.id, "approve");
    await changePurchaseStatus(companyId, userId, order!.id, "send");

    const stockBefore = await prisma.product.findUniqueOrThrow({
      where: { id: productExpiryId },
    });

    const itemExp = order!.items.find((i) => i.productId === productExpiryId)!;
    const itemSimple = order!.items.find(
      (i) => i.productId === productSimpleId,
    )!;

    const future = new Date();
    future.setMonth(future.getMonth() + 4);

    // partial receive of expiry product only
    const partial = await receivePurchase(companyId, userId, order!.id, {
      notes: "parcial",
      items: [
        {
          purchaseOrderItemId: itemExp.id,
          productId: productExpiryId,
          quantity: 4,
          unitCost: 11.5,
          batchCode: "PC-TEST-LOT-1",
          expiresAt: future.toISOString().slice(0, 10),
          divergenceNotes: null,
        },
      ],
    });

    expect(partial.order?.status).toBe("PARTIALLY_RECEIVED");

    const mid = await prisma.product.findUniqueOrThrow({
      where: { id: productExpiryId },
    });
    expect(toNumber(mid.currentStock)).toBe(
      toNumber(stockBefore.currentStock) + 4,
    );
    expect(toNumber(mid.costPrice)).toBe(11.5);

    // complete remaining
    const full = await receivePurchase(companyId, userId, order!.id, {
      notes: "saldo",
      items: [
        {
          purchaseOrderItemId: itemExp.id,
          productId: productExpiryId,
          quantity: 6,
          unitCost: 12,
          batchCode: "PC-TEST-LOT-1",
          expiresAt: future.toISOString().slice(0, 10),
          divergenceNotes: null,
        },
        {
          purchaseOrderItemId: itemSimple.id,
          productId: productSimpleId,
          quantity: 4,
          unitCost: 20,
          batchCode: null,
          expiresAt: null,
          divergenceNotes: null,
        },
      ],
    });

    expect(full.order?.status).toBe("RECEIVED");

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: productExpiryId },
    });
    expect(toNumber(after.currentStock)).toBe(
      toNumber(stockBefore.currentStock) + 10,
    );
    expect(toNumber(after.costPrice)).toBe(12);

    // cannot receive more
    await expect(
      receivePurchase(companyId, userId, order!.id, {
        notes: null,
        items: [
          {
            purchaseOrderItemId: itemExp.id,
            productId: productExpiryId,
            quantity: 1,
            unitCost: 12,
            batchCode: "X",
            expiresAt: null,
            divergenceNotes: null,
          },
        ],
      }),
    ).rejects.toThrow(/não permite recebimento|excede/i);
  });
});
