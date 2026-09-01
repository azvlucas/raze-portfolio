import { prisma } from "@/lib/prisma";
import {
  Prisma,
  SaleChannel,
  SaleOrderStatus,
  PaymentStatus,
  StockMovementType,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit.service";
import { toNumber, roundMoney } from "@/lib/money";
import { stockOutFefo, applyStockDelta } from "@/modules/stock/stock.service";
import { validateAndComputeCoupon } from "@/modules/coupons/coupon.service";
import type { SaleOrderInput } from "./sale.schema";

function emptyToNull(v?: string | null) {
  if (v === undefined) return undefined;
  if (v === null || String(v).trim() === "") return null;
  return String(v).trim();
}

function itemLineTotal(qty: number, price: number, discount: number) {
  return roundMoney(qty * price - discount);
}

function serializeSale<T extends { items?: Array<Record<string, unknown>>; payments?: Array<Record<string, unknown>> }>(
  order: T & {
    subtotal: unknown;
    itemDiscount: unknown;
    orderDiscount: unknown;
    surcharge: unknown;
    freight: unknown;
    total: unknown;
  },
) {
  const asNum = (v: unknown) =>
    toNumber(v as number | string | { toString(): string } | null);
  return {
    ...order,
    subtotal: asNum(order.subtotal),
    itemDiscount: asNum(order.itemDiscount),
    orderDiscount: asNum(order.orderDiscount),
    surcharge: asNum(order.surcharge),
    freight: asNum(order.freight),
    total: asNum(order.total),
    items: order.items?.map((i) => ({
      ...i,
      quantity: asNum(i.quantity),
      unitPrice: asNum(i.unitPrice),
      unitCost: asNum(i.unitCost),
      discount: asNum(i.discount),
      total: asNum(i.total),
    })),
    payments: order.payments?.map((p) => ({
      ...p,
      amount: asNum(p.amount),
      amountReceived: p.amountReceived == null ? null : asNum(p.amountReceived),
      changeAmount: p.changeAmount == null ? null : asNum(p.changeAmount),
      feeAmount: asNum(p.feeAmount),
    })),
  };
}

export async function listSales(
  companyId: string,
  query: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    channel?: string;
    customerId?: string;
  },
) {
  const where: Prisma.SaleOrderWhereInput = { companyId };
  if (query.status && query.status !== "all") {
    where.status = query.status as SaleOrderStatus;
  }
  if (query.channel && query.channel !== "all") {
    where.channel = query.channel as SaleChannel;
  }
  if (query.customerId) where.customerId = query.customerId;
  if (query.search?.trim()) {
    const n = Number(query.search.trim());
    where.OR = [
      ...(Number.isFinite(n) ? [{ number: n }] : []),
      {
        customer: {
          name: { contains: query.search.trim(), mode: "insensitive" as const },
        },
      },
      { couponCode: { contains: query.search.trim(), mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [total, items] = await Promise.all([
    prisma.saleOrder.count({ where }),
    prisma.saleOrder.findMany({
      where,
      orderBy: { number: "desc" },
      skip,
      take: query.pageSize,
      include: {
        customer: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  return {
    items: items.map((o) => ({
      ...serializeSale(o),
      itemCount: o._count.items,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getSale(companyId: string, id: string) {
  const order = await prisma.saleOrder.findFirst({
    where: { id, companyId },
    include: {
      customer: true,
      pet: true,
      seller: { select: { id: true, name: true } },
      coupon: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              internalCode: true,
              barcode: true,
              trackExpiry: true,
            },
          },
          batch: { select: { id: true, code: true, expiresAt: true } },
        },
      },
      payments: {
        include: {
          paymentMethod: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });
  if (!order) return null;
  return serializeSale(order);
}

async function nextSaleNumber(companyId: string, tx: Prisma.TransactionClient) {
  const last = await tx.saleOrder.findFirst({
    where: { companyId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

async function resolveItems(
  companyId: string,
  items: SaleOrderInput["items"],
  tx: Prisma.TransactionClient,
) {
  const resolved = [];
  for (const item of items) {
    const product = await tx.product.findFirst({
      where: { id: item.productId, companyId, deletedAt: null, active: true },
    });
    if (!product) throw new Error("Produto inválido na venda");
    if (item.discount > item.quantity * item.unitPrice) {
      throw new Error(`Desconto inválido no item ${product.name}`);
    }
    resolved.push({
      product,
      quantity: item.quantity,
      unitPrice: roundMoney(item.unitPrice),
      unitCost: toNumber(product.costPrice),
      discount: roundMoney(item.discount),
      total: itemLineTotal(item.quantity, item.unitPrice, item.discount),
    });
  }
  return resolved;
}

export async function createSale(
  companyId: string,
  userId: string,
  input: SaleOrderInput,
  options?: { maxDiscountPercent?: number; canDiscount?: boolean },
) {
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, companyId, deletedAt: null },
    });
    if (!customer) throw new Error("Cliente inválido");
  }
  if (input.petId) {
    const pet = await prisma.pet.findFirst({
      where: {
        id: input.petId,
        customerId: input.customerId ?? undefined,
        customer: { companyId },
      },
    });
    if (!pet) throw new Error("Pet inválido ou não pertence ao cliente");
  }

  const statusMap: Record<string, SaleOrderStatus> = {
    draft: "DRAFT",
    quote: "QUOTE",
    confirm: "COMPLETED",
  };
  const status = statusMap[input.intent] ?? "COMPLETED";
  const shouldStockOut = input.intent === "confirm";

  return prisma.$transaction(async (tx) => {
    const resolved = await resolveItems(companyId, input.items, tx);

    const itemDiscount = roundMoney(
      resolved.reduce((s, i) => s + i.discount, 0),
    );
    const subtotal = roundMoney(resolved.reduce((s, i) => s + i.total, 0));

    const manualDiscount = roundMoney(input.orderDiscount);
    let couponId: string | null = null;
    let couponCode: string | null = null;
    let couponDiscount = 0;

    if (input.couponCode?.trim()) {
      const { coupon, discountAmount } = await validateAndComputeCoupon(
        {
          companyId,
          code: input.couponCode,
          orderSubtotal: subtotal,
          channel: input.channel,
          customerId: input.customerId,
          productIds: resolved.map((r) => r.product.id),
          categoryIds: resolved
            .map((r) => r.product.categoryId)
            .filter(Boolean) as string[],
        },
        tx,
      );
      couponId = coupon.id;
      couponCode = coupon.code;
      couponDiscount = discountAmount;
    }

    if (manualDiscount > 0) {
      if (!options?.canDiscount) {
        throw new Error("Sem permissão para aplicar descontos");
      }
      const maxPct = options.maxDiscountPercent ?? 100;
      const pct = subtotal > 0 ? (manualDiscount / subtotal) * 100 : 0;
      if (pct > maxPct + 0.01) {
        throw new Error(
          `Desconto excede o limite permitido (${maxPct}%)`,
        );
      }
    }

    const orderDiscount = roundMoney(manualDiscount + couponDiscount);

    const total = roundMoney(
      Math.max(
        0,
        subtotal - orderDiscount + input.surcharge + input.freight,
      ),
    );

    if (shouldStockOut && input.payments?.length) {
      const paid = roundMoney(
        input.payments.reduce((s, p) => s + p.amount, 0),
      );
      if (Math.abs(paid - total) > 0.05) {
        throw new Error(
          `Soma dos pagamentos (${paid}) difere do total da venda (${total})`,
        );
      }
    }

    if (shouldStockOut) {
      for (const line of resolved) {
        if (toNumber(line.product.currentStock) < line.quantity) {
          throw new Error(
            `Estoque insuficiente: ${line.product.name} (disp. ${toNumber(line.product.currentStock)})`,
          );
        }
      }
    }

    const number = await nextSaleNumber(companyId, tx);

    // Create order first without items that need batch allocation
    const order = await tx.saleOrder.create({
      data: {
        companyId,
        number,
        customerId: emptyToNull(input.customerId) ?? null,
        petId: emptyToNull(input.petId) ?? null,
        channel: input.channel as SaleChannel,
        sellerId: userId,
        status,
        subtotal,
        itemDiscount,
        orderDiscount,
        surcharge: input.surcharge,
        freight: input.freight,
        total,
        couponId,
        couponCode,
        notes: emptyToNull(input.notes) ?? null,
        completedAt: shouldStockOut ? new Date() : null,
      },
    });

    for (const line of resolved) {
      if (shouldStockOut) {
        const movements = await stockOutFefo(
          {
            productId: line.product.id,
            quantity: line.quantity,
            type: "SALE_OUT" as StockMovementType,
            originType: "SaleOrder",
            originId: order.id,
            userId,
            reason: `Venda PV-${number}`,
          },
          tx,
        );

        // If multiple batches, split sale items proportionally by qty
        const unitPrice = line.unitPrice;
        const unitCost = line.unitCost;
        let remainingDiscount = line.discount;

        for (let i = 0; i < movements.length; i++) {
          const mov = movements[i];
          const qty = mov.qty;
          const isLast = i === movements.length - 1;
          const share =
            line.quantity > 0 ? qty / line.quantity : 1;
          const disc = isLast
            ? remainingDiscount
            : roundMoney(line.discount * share);
          remainingDiscount = roundMoney(remainingDiscount - disc);

          await tx.saleOrderItem.create({
            data: {
              saleOrderId: order.id,
              productId: line.product.id,
              batchId: mov.batchId || null,
              quantity: qty,
              unitPrice,
              unitCost,
              discount: disc,
              total: itemLineTotal(qty, unitPrice, disc),
            },
          });
        }
      } else {
        await tx.saleOrderItem.create({
          data: {
            saleOrderId: order.id,
            productId: line.product.id,
            batchId: null,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            unitCost: line.unitCost,
            discount: line.discount,
            total: line.total,
          },
        });
      }
    }

    if (shouldStockOut && input.payments?.length) {
      for (const p of input.payments) {
        const method = await tx.paymentMethod.findFirst({
          where: { id: p.paymentMethodId, companyId, active: true },
        });
        if (!method) throw new Error("Forma de pagamento inválida");

        await tx.salePayment.create({
          data: {
            saleOrderId: order.id,
            paymentMethodId: p.paymentMethodId,
            amount: p.amount,
            amountReceived: p.amountReceived ?? p.amount,
            changeAmount: p.changeAmount ?? 0,
            feeAmount: p.feeAmount ?? 0,
            installments: p.installments ?? 1,
            status: (p.status as PaymentStatus) ?? "PAID",
            paidAt: p.status === "PENDING" ? null : new Date(),
            notes: emptyToNull(p.notes) ?? null,
          },
        });
      }
    }

    if (shouldStockOut && couponId && couponDiscount > 0) {
      await tx.couponUsage.create({
        data: {
          couponId,
          saleOrderId: order.id,
          customerId: emptyToNull(input.customerId) ?? null,
          discountAmount: couponDiscount,
        },
      });
    }

    await writeAuditLog(
      {
        companyId,
        userId,
        action: shouldStockOut ? "SALE_CONFIRM" : "SALE_CREATE",
        entityType: "SaleOrder",
        entityId: order.id,
        after: { number, status, total },
      },
      tx,
    );

    return order.id;
  }).then((id) => getSale(companyId, id));
}

export async function confirmSale(
  companyId: string,
  userId: string,
  id: string,
  payments?: SaleOrderInput["payments"],
) {
  const order = await prisma.saleOrder.findFirst({
    where: { id, companyId },
    include: {
      items: { include: { product: true } },
      payments: true,
    },
  });
  if (!order) throw new Error("Venda não encontrada");
  if (!["DRAFT", "QUOTE", "AWAITING_PAYMENT"].includes(order.status)) {
    throw new Error("Venda não pode ser confirmada neste status");
  }

  return prisma.$transaction(async (tx) => {
    // Delete draft items and re-create with stock out
    const draftItems = order.items;
    await tx.saleOrderItem.deleteMany({ where: { saleOrderId: id } });

    for (const item of draftItems) {
      const product = item.product;
      if (toNumber(product.currentStock) < toNumber(item.quantity)) {
        throw new Error(`Estoque insuficiente: ${product.name}`);
      }

      const movements = await stockOutFefo(
        {
          productId: product.id,
          quantity: toNumber(item.quantity),
          type: "SALE_OUT",
          originType: "SaleOrder",
          originId: id,
          userId,
          reason: `Venda PV-${order.number}`,
        },
        tx,
      );

      for (const mov of movements) {
        const share =
          toNumber(item.quantity) > 0
            ? mov.qty / toNumber(item.quantity)
            : 1;
        const disc = roundMoney(toNumber(item.discount) * share);
        await tx.saleOrderItem.create({
          data: {
            saleOrderId: id,
            productId: product.id,
            batchId: mov.batchId || null,
            quantity: mov.qty,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
            discount: disc,
            total: itemLineTotal(mov.qty, toNumber(item.unitPrice), disc),
          },
        });
      }
    }

    if (payments?.length) {
      await tx.salePayment.deleteMany({ where: { saleOrderId: id } });
      for (const p of payments) {
        await tx.salePayment.create({
          data: {
            saleOrderId: id,
            paymentMethodId: p.paymentMethodId,
            amount: p.amount,
            amountReceived: p.amountReceived ?? p.amount,
            changeAmount: p.changeAmount ?? 0,
            feeAmount: p.feeAmount ?? 0,
            installments: p.installments ?? 1,
            status: (p.status as PaymentStatus) ?? "PAID",
            paidAt: new Date(),
            notes: emptyToNull(p.notes) ?? null,
          },
        });
      }
    }

    if (order.couponId) {
      const existingUsage = await tx.couponUsage.findFirst({
        where: { saleOrderId: id },
      });
      if (!existingUsage) {
        await tx.couponUsage.create({
          data: {
            couponId: order.couponId,
            saleOrderId: id,
            customerId: order.customerId,
            discountAmount: order.orderDiscount,
          },
        });
      }
    }

    await tx.saleOrder.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    await writeAuditLog(
      {
        companyId,
        userId,
        action: "SALE_CONFIRM",
        entityType: "SaleOrder",
        entityId: id,
      },
      tx,
    );

    return id;
  }).then((saleId) => getSale(companyId, saleId));
}

export async function cancelSale(
  companyId: string,
  userId: string,
  id: string,
  reason: string,
) {
  const order = await prisma.saleOrder.findFirst({
    where: { id, companyId },
    include: { items: true, payments: true },
  });
  if (!order) throw new Error("Venda não encontrada");
  if (order.status === "CANCELLED") throw new Error("Venda já cancelada");

  const needsRestock = ["COMPLETED", "CONFIRMED", "SEPARATING"].includes(
    order.status,
  );

  return prisma.$transaction(async (tx) => {
    if (needsRestock) {
      for (const item of order.items) {
        await applyStockDelta(
          {
            productId: item.productId,
            batchId: item.batchId,
            delta: toNumber(item.quantity),
            type: "SALE_CANCEL",
            originType: "SaleOrder",
            originId: id,
            userId,
            reason: `Cancelamento PV-${order.number}: ${reason}`,
            allowCreateBatch:
              !item.batchId
                ? {
                    code: `CANCEL-PV${order.number}-${item.productId.slice(-4)}`,
                    expiresAt: null,
                  }
                : undefined,
          },
          tx,
        );
      }
    }

    await tx.salePayment.updateMany({
      where: { saleOrderId: id },
      data: { status: "CANCELLED" },
    });

    await tx.saleOrder.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    await writeAuditLog(
      {
        companyId,
        userId,
        action: "SALE_CANCEL",
        entityType: "SaleOrder",
        entityId: id,
        after: { reason, restocked: needsRestock },
      },
      tx,
    );

    return id;
  }).then((saleId) => getSale(companyId, saleId));
}

export async function listPaymentMethods(companyId: string) {
  return prisma.paymentMethod.findMany({
    where: { companyId, active: true },
    orderBy: { sortOrder: "asc" },
  });
}

export function saleReceiptText(
  order: NonNullable<Awaited<ReturnType<typeof getSale>>>,
) {
  return [
    `COMPROVANTE DE VENDA PV-${order.number}`,
    `Status: ${order.status}`,
    `Data: ${new Date(order.saleDate).toLocaleString("pt-BR")}`,
    `Canal: ${order.channel}`,
    order.customer
      ? `Cliente: ${(order.customer as { name: string }).name}`
      : "Cliente: Consumidor não identificado",
    order.seller
      ? `Vendedor: ${(order.seller as { name: string }).name}`
      : "",
    "",
    "ITENS:",
    ...(order.items ?? []).map(
      (i) =>
        `- ${(i.product as { internalCode: string; name: string }).internalCode} ${(i.product as { name: string }).name} x${i.quantity} @ ${i.unitPrice} = ${i.total}`,
    ),
    "",
    `Subtotal: ${order.subtotal}`,
    `Descontos: ${roundMoney(order.itemDiscount + order.orderDiscount)}`,
    order.couponCode ? `Cupom: ${order.couponCode}` : "",
    `Frete: ${order.freight}`,
    `TOTAL: ${order.total}`,
    "",
    "PAGAMENTOS:",
    ...(order.payments ?? []).map(
      (p) =>
        `- ${(p.paymentMethod as { name: string }).name}: ${p.amount}${p.changeAmount ? ` (troco ${p.changeAmount})` : ""}`,
    ),
    order.notes ? `Obs: ${order.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
