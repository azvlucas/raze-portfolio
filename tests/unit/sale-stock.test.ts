import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { createSale, cancelSale } from "../../src/modules/sales/sale.service";
import { adjustStock } from "../../src/modules/stock/stock.service";
import { createCoupon } from "../../src/modules/coupons/coupon.service";
import { toNumber } from "../../src/lib/money";

describe("sale stock out, cancel restock, coupon", () => {
  let companyId = "";
  let userId = "";
  let productId = "";
  let paymentMethodId = "";
  let customerId = "";

  beforeAll(async () => {
    const company = await prisma.company.findFirst();
    const user = await prisma.user.findFirst({ where: { active: true } });
    const product = await prisma.product.findFirst({
      where: { trackExpiry: false, active: true },
    });
    const pm = await prisma.paymentMethod.findFirst({
      where: { active: true },
    });
    const customer = await prisma.customer.findFirst({
      where: { active: true },
    });
    if (!company || !user || !product || !pm || !customer) {
      throw new Error("Seed incompleto");
    }
    companyId = company.id;
    userId = user.id;
    productId = product.id;
    paymentMethodId = pm.id;
    customerId = customer.id;

    // ensure stock
    const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    if (toNumber(p.currentStock) < 20) {
      await adjustStock(companyId, userId, {
        productId,
        quantity: 30,
        type: "ADJUST_IN",
        reason: "Seed estoque para teste de venda",
      });
    }
  });

  it("blocks sale without stock", async () => {
    const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const stock = toNumber(p.currentStock);

    await expect(
      createSale(
        companyId,
        userId,
        {
          channel: "STORE",
          intent: "confirm",
          orderDiscount: 0,
          surcharge: 0,
          freight: 0,
          items: [
            {
              productId,
              quantity: stock + 100,
              unitPrice: 10,
              discount: 0,
            },
          ],
          payments: [
            {
              paymentMethodId,
              amount: 10 * (stock + 100),
              installments: 1,
              feeAmount: 0,
              status: "PAID",
            },
          ],
        },
        { canDiscount: true, maxDiscountPercent: 100 },
      ),
    ).rejects.toThrow(/estoque insuficiente/i);
  });

  it("sells, reduces stock, cancels and restocks", async () => {
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const stockBefore = toNumber(before.currentStock);

    const sale = await createSale(
      companyId,
      userId,
      {
        customerId,
        channel: "STORE",
        intent: "confirm",
        orderDiscount: 0,
        surcharge: 0,
        freight: 0,
        items: [
          {
            productId,
            quantity: 2,
            unitPrice: toNumber(before.salePrice),
            discount: 0,
          },
        ],
        payments: [
          {
            paymentMethodId,
            amount: toNumber(before.salePrice) * 2,
            amountReceived: toNumber(before.salePrice) * 2,
            changeAmount: 0,
            installments: 1,
            feeAmount: 0,
            status: "PAID",
          },
        ],
      },
      { canDiscount: true, maxDiscountPercent: 100 },
    );

    expect(sale?.status).toBe("COMPLETED");

    const mid = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(toNumber(mid.currentStock)).toBe(stockBefore - 2);

    const cancelled = await cancelSale(
      companyId,
      userId,
      sale!.id,
      "Teste de estorno",
    );
    expect(cancelled?.status).toBe("CANCELLED");

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(toNumber(after.currentStock)).toBe(stockBefore);
  });

  it("applies coupon and enforces max uses per customer", async () => {
    const code = `T${Date.now().toString().slice(-6)}`;
    await createCoupon(companyId, userId, {
      code,
      description: "Teste",
      discountType: "FIXED",
      discountValue: 5,
      minOrderValue: 0,
      startsAt: new Date().toISOString(),
      endsAt: null,
      maxUses: 10,
      maxUsesPerCustomer: 1,
      active: true,
      channels: [],
      productIds: [],
      categoryIds: [],
    });

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const price = toNumber(product.salePrice);
    const total = price * 1 - 5;

    const sale1 = await createSale(
      companyId,
      userId,
      {
        customerId,
        channel: "STORE",
        intent: "confirm",
        couponCode: code,
        orderDiscount: 0,
        surcharge: 0,
        freight: 0,
        items: [
          { productId, quantity: 1, unitPrice: price, discount: 0 },
        ],
        payments: [
          {
            paymentMethodId,
            amount: total,
            installments: 1,
            feeAmount: 0,
            status: "PAID",
          },
        ],
      },
      { canDiscount: true, maxDiscountPercent: 100 },
    );

    expect(sale1!.orderDiscount).toBeGreaterThanOrEqual(5);

    await expect(
      createSale(
        companyId,
        userId,
        {
          customerId,
          channel: "STORE",
          intent: "confirm",
          couponCode: code,
          orderDiscount: 0,
          surcharge: 0,
          freight: 0,
          items: [
            { productId, quantity: 1, unitPrice: price, discount: 0 },
          ],
          payments: [
            {
              paymentMethodId,
              amount: total,
              installments: 1,
              feeAmount: 0,
              status: "PAID",
            },
          ],
        },
        { canDiscount: true, maxDiscountPercent: 100 },
      ),
    ).rejects.toThrow(/limite de uso/i);
  });
});
