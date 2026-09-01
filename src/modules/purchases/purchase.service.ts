import { prisma } from "@/lib/prisma";
import { Prisma, PurchaseOrderStatus } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit.service";
import { toNumber, roundMoney } from "@/lib/money";
import { applyStockDelta } from "@/modules/stock/stock.service";
import type {
  PurchaseOrderInput,
  ReceiptInput,
  SupplierInput,
} from "./purchase.schema";

function emptyToNull(v?: string | null) {
  if (v === undefined) return undefined;
  if (v === null || String(v).trim() === "") return null;
  return String(v).trim();
}

function calcItemTotal(qty: number, unitCost: number, discount: number) {
  return roundMoney(qty * unitCost - discount);
}

function calcOrderTotals(
  items: Array<{ quantity: number; unitCost: number; discount: number }>,
  discountTotal: number,
  freight: number,
  otherExpenses: number,
) {
  const productsTotal = roundMoney(
    items.reduce(
      (sum, i) => sum + calcItemTotal(i.quantity, i.unitCost, i.discount),
      0,
    ),
  );
  const grandTotal = roundMoney(
    productsTotal - discountTotal + freight + otherExpenses,
  );
  return { productsTotal, grandTotal };
}

// ── Suppliers ────────────────────────────────

export async function listSuppliers(
  companyId: string,
  query: {
    page: number;
    pageSize: number;
    search?: string;
    active?: string;
  },
) {
  const where: Prisma.SupplierWhereInput = {
    companyId,
    deletedAt: null,
  };
  if (query.active === "true") where.active = true;
  if (query.active === "false") where.active = false;
  if (query.search?.trim()) {
    const s = query.search.trim();
    where.OR = [
      { legalName: { contains: s, mode: "insensitive" } },
      { tradeName: { contains: s, mode: "insensitive" } },
      { document: { contains: s, mode: "insensitive" } },
      { email: { contains: s, mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [total, items] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      orderBy: { legalName: "asc" },
      skip,
      take: query.pageSize,
    }),
  ]);

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getSupplier(companyId: string, id: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id, companyId, deletedAt: null },
  });
  if (!supplier) return null;

  const orders = await prisma.purchaseOrder.findMany({
    where: { supplierId: id, companyId },
    orderBy: { issueDate: "desc" },
    take: 20,
    include: {
      items: {
        include: { product: { select: { id: true, name: true, internalCode: true } } },
      },
    },
  });

  const completed = orders.filter((o) =>
    ["RECEIVED", "PARTIALLY_RECEIVED"].includes(o.status),
  );
  const totalPurchased = completed.reduce(
    (s, o) => s + toNumber(o.grandTotal),
    0,
  );
  const lastPurchase = completed[0] ?? null;
  const pending = orders.filter((o) =>
    !["RECEIVED", "CANCELLED"].includes(o.status),
  );

  const productIds = new Set<string>();
  for (const o of completed) {
    for (const i of o.items) productIds.add(i.productId);
  }

  return {
    ...supplier,
    stats: {
      totalPurchased: roundMoney(totalPurchased),
      orderCount: completed.length,
      lastPurchaseDate: lastPurchase?.issueDate ?? null,
      lastPurchaseNumber: lastPurchase?.number ?? null,
      pendingOrders: pending.length,
      productsSupplied: productIds.size,
    },
    recentOrders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      issueDate: o.issueDate,
      grandTotal: toNumber(o.grandTotal),
      expectedDate: o.expectedDate,
    })),
  };
}

export async function createSupplier(
  companyId: string,
  userId: string,
  input: SupplierInput,
) {
  const supplier = await prisma.supplier.create({
    data: {
      companyId,
      legalName: input.legalName.trim(),
      tradeName: emptyToNull(input.tradeName) ?? null,
      document: emptyToNull(input.document) ?? null,
      stateRegistration: emptyToNull(input.stateRegistration) ?? null,
      phone: emptyToNull(input.phone) ?? null,
      whatsapp: emptyToNull(input.whatsapp) ?? null,
      email: emptyToNull(input.email) ?? null,
      address: emptyToNull(input.address) ?? null,
      city: emptyToNull(input.city) ?? null,
      state: emptyToNull(input.state)?.toUpperCase() ?? null,
      mainContact: emptyToNull(input.mainContact) ?? null,
      avgDeliveryDays: input.avgDeliveryDays ?? null,
      paymentTerms: emptyToNull(input.paymentTerms) ?? null,
      notes: emptyToNull(input.notes) ?? null,
      active: input.active ?? true,
    },
  });

  await writeAuditLog({
    companyId,
    userId,
    action: "CREATE",
    entityType: "Supplier",
    entityId: supplier.id,
    after: supplier,
  });

  return supplier;
}

export async function updateSupplier(
  companyId: string,
  userId: string,
  id: string,
  input: SupplierInput,
) {
  const current = await prisma.supplier.findFirst({
    where: { id, companyId, deletedAt: null },
  });
  if (!current) throw new Error("Fornecedor não encontrado");

  const updated = await prisma.supplier.update({
    where: { id },
    data: {
      legalName: input.legalName.trim(),
      tradeName: emptyToNull(input.tradeName) ?? null,
      document: emptyToNull(input.document) ?? null,
      stateRegistration: emptyToNull(input.stateRegistration) ?? null,
      phone: emptyToNull(input.phone) ?? null,
      whatsapp: emptyToNull(input.whatsapp) ?? null,
      email: emptyToNull(input.email) ?? null,
      address: emptyToNull(input.address) ?? null,
      city: emptyToNull(input.city) ?? null,
      state: emptyToNull(input.state)?.toUpperCase() ?? null,
      mainContact: emptyToNull(input.mainContact) ?? null,
      avgDeliveryDays: input.avgDeliveryDays ?? null,
      paymentTerms: emptyToNull(input.paymentTerms) ?? null,
      notes: emptyToNull(input.notes) ?? null,
      active: input.active ?? true,
    },
  });

  await writeAuditLog({
    companyId,
    userId,
    action: "UPDATE",
    entityType: "Supplier",
    entityId: id,
    before: current,
    after: updated,
  });

  return updated;
}

export async function deactivateSupplier(
  companyId: string,
  userId: string,
  id: string,
) {
  const current = await prisma.supplier.findFirst({
    where: { id, companyId, deletedAt: null },
  });
  if (!current) throw new Error("Fornecedor não encontrado");

  const updated = await prisma.supplier.update({
    where: { id },
    data: { active: false },
  });

  await writeAuditLog({
    companyId,
    userId,
    action: "DEACTIVATE",
    entityType: "Supplier",
    entityId: id,
    before: { active: true },
    after: { active: false },
  });

  return updated;
}

// ── Purchase orders ──────────────────────────

const EDITABLE: PurchaseOrderStatus[] = ["DRAFT", "AWAITING_APPROVAL"];
const RECEIVABLE: PurchaseOrderStatus[] = [
  "APPROVED",
  "SENT_TO_SUPPLIER",
  "PARTIALLY_RECEIVED",
];

function asNum(value: unknown) {
  return toNumber(value as number | string | { toString(): string } | null);
}

function serializeOrder<T extends { items?: Array<Record<string, unknown>> }>(
  order: T & {
    productsTotal: unknown;
    discountTotal: unknown;
    freight: unknown;
    otherExpenses: unknown;
    grandTotal: unknown;
  },
) {
  return {
    ...order,
    productsTotal: asNum(order.productsTotal),
    discountTotal: asNum(order.discountTotal),
    freight: asNum(order.freight),
    otherExpenses: asNum(order.otherExpenses),
    grandTotal: asNum(order.grandTotal),
    items: order.items?.map((i) => ({
      ...i,
      quantity: asNum(i.quantity),
      unitCost: asNum(i.unitCost),
      discount: asNum(i.discount),
      total: asNum(i.total),
      qtyReceived: asNum(i.qtyReceived),
    })),
  };
}

export async function listPurchaseOrders(
  companyId: string,
  query: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    supplierId?: string;
  },
) {
  const where: Prisma.PurchaseOrderWhereInput = { companyId };
  if (query.status && query.status !== "all") {
    where.status = query.status as PurchaseOrderStatus;
  }
  if (query.supplierId) where.supplierId = query.supplierId;
  if (query.search?.trim()) {
    const n = Number(query.search.trim());
    where.OR = [
      ...(Number.isFinite(n) ? [{ number: n }] : []),
      {
        supplier: {
          legalName: { contains: query.search.trim(), mode: "insensitive" as const },
        },
      },
      {
        supplier: {
          tradeName: { contains: query.search.trim(), mode: "insensitive" as const },
        },
      },
    ];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [total, items] = await Promise.all([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { number: "desc" },
      skip,
      take: query.pageSize,
      include: {
        supplier: {
          select: { id: true, legalName: true, tradeName: true },
        },
        user: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  return {
    items: items.map((o) => ({
      ...serializeOrder(o),
      itemCount: o._count.items,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getPurchaseOrder(companyId: string, id: string) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, companyId },
    include: {
      supplier: true,
      user: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              internalCode: true,
              trackExpiry: true,
              costPrice: true,
              currentStock: true,
            },
          },
        },
      },
      receipts: {
        orderBy: { receivedAt: "desc" },
        include: {
          user: { select: { id: true, name: true } },
          items: true,
        },
      },
    },
  });
  if (!order) return null;

  return {
    ...serializeOrder(order),
    items: order.items.map((i) => ({
      ...i,
      quantity: toNumber(i.quantity),
      unitCost: toNumber(i.unitCost),
      discount: toNumber(i.discount),
      total: toNumber(i.total),
      qtyReceived: toNumber(i.qtyReceived),
      qtyPending: roundMoney(toNumber(i.quantity) - toNumber(i.qtyReceived)),
      product: {
        ...i.product,
        costPrice: toNumber(i.product.costPrice),
        currentStock: toNumber(i.product.currentStock),
      },
    })),
    receipts: order.receipts.map((r) => ({
      ...r,
      items: r.items.map((ri) => ({
        ...ri,
        quantity: toNumber(ri.quantity),
        unitCost: toNumber(ri.unitCost),
      })),
    })),
    editable: EDITABLE.includes(order.status),
    receivable: RECEIVABLE.includes(order.status),
  };
}

export async function createPurchaseOrder(
  companyId: string,
  userId: string,
  input: PurchaseOrderInput,
) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, companyId, active: true, deletedAt: null },
  });
  if (!supplier) throw new Error("Fornecedor inválido");

  for (const item of input.items) {
    const product = await prisma.product.findFirst({
      where: { id: item.productId, companyId, deletedAt: null },
    });
    if (!product) throw new Error("Produto inválido no pedido");
  }

  const { productsTotal, grandTotal } = calcOrderTotals(
    input.items,
    input.discountTotal,
    input.freight,
    input.otherExpenses,
  );

  const last = await prisma.purchaseOrder.findFirst({
    where: { companyId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const number = (last?.number ?? 0) + 1;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        companyId,
        number,
        supplierId: input.supplierId,
        expectedDate: input.expectedDate
          ? new Date(input.expectedDate)
          : null,
        status: "DRAFT",
        productsTotal,
        discountTotal: input.discountTotal,
        freight: input.freight,
        otherExpenses: input.otherExpenses,
        grandTotal,
        paymentTerms:
          emptyToNull(input.paymentTerms) ?? supplier.paymentTerms,
        notes: emptyToNull(input.notes) ?? null,
        userId,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitCost: i.unitCost,
            discount: i.discount,
            total: calcItemTotal(i.quantity, i.unitCost, i.discount),
            qtyReceived: 0,
          })),
        },
      },
      include: { items: true, supplier: true },
    });

    await writeAuditLog(
      {
        companyId,
        userId,
        action: "CREATE",
        entityType: "PurchaseOrder",
        entityId: created.id,
        after: { number: created.number, status: created.status },
      },
      tx,
    );

    return created;
  });

  return getPurchaseOrder(companyId, order.id);
}

export async function updatePurchaseOrder(
  companyId: string,
  userId: string,
  id: string,
  input: PurchaseOrderInput,
) {
  const current = await prisma.purchaseOrder.findFirst({
    where: { id, companyId },
    include: { items: true },
  });
  if (!current) throw new Error("Pedido não encontrado");
  if (!EDITABLE.includes(current.status)) {
    throw new Error(
      "Pedido não pode ser editado neste status. Use cancelamento, devolução ou correção.",
    );
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, companyId, deletedAt: null },
  });
  if (!supplier) throw new Error("Fornecedor inválido");

  const { productsTotal, grandTotal } = calcOrderTotals(
    input.items,
    input.discountTotal,
    input.freight,
    input.otherExpenses,
  );

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: input.supplierId,
        expectedDate: input.expectedDate
          ? new Date(input.expectedDate)
          : null,
        productsTotal,
        discountTotal: input.discountTotal,
        freight: input.freight,
        otherExpenses: input.otherExpenses,
        grandTotal,
        paymentTerms: emptyToNull(input.paymentTerms) ?? null,
        notes: emptyToNull(input.notes) ?? null,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitCost: i.unitCost,
            discount: i.discount,
            total: calcItemTotal(i.quantity, i.unitCost, i.discount),
            qtyReceived: 0,
          })),
        },
      },
    });

    await writeAuditLog(
      {
        companyId,
        userId,
        action: "UPDATE",
        entityType: "PurchaseOrder",
        entityId: id,
        before: { status: current.status, grandTotal: current.grandTotal },
        after: { grandTotal },
      },
      tx,
    );
  });

  return getPurchaseOrder(companyId, id);
}

export async function changePurchaseStatus(
  companyId: string,
  userId: string,
  id: string,
  action: "submit_approval" | "approve" | "send" | "cancel",
  reason?: string | null,
) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, companyId },
  });
  if (!order) throw new Error("Pedido não encontrado");

  let next: PurchaseOrderStatus | null = null;

  switch (action) {
    case "submit_approval":
      if (order.status !== "DRAFT") {
        throw new Error("Somente rascunhos podem ser enviados para aprovação");
      }
      next = "AWAITING_APPROVAL";
      break;
    case "approve":
      if (!["DRAFT", "AWAITING_APPROVAL"].includes(order.status)) {
        throw new Error("Pedido não pode ser aprovado neste status");
      }
      next = "APPROVED";
      break;
    case "send":
      if (order.status !== "APPROVED") {
        throw new Error("Somente pedidos aprovados podem ser enviados");
      }
      next = "SENT_TO_SUPPLIER";
      break;
    case "cancel":
      if (["RECEIVED", "CANCELLED"].includes(order.status)) {
        throw new Error("Pedido não pode ser cancelado");
      }
      if (order.status === "PARTIALLY_RECEIVED") {
        throw new Error(
          "Pedido parcialmente recebido não pode ser cancelado por este fluxo",
        );
      }
      next = "CANCELLED";
      break;
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: next! },
  });

  await writeAuditLog({
    companyId,
    userId,
    action: `STATUS_${action.toUpperCase()}`,
    entityType: "PurchaseOrder",
    entityId: id,
    before: { status: order.status },
    after: { status: next, reason },
  });

  return updated;
}

// ── Receiving ────────────────────────────────

export async function receivePurchase(
  companyId: string,
  userId: string,
  purchaseOrderId: string,
  input: ReceiptInput,
) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, companyId },
    include: {
      items: {
        include: { product: true },
      },
      supplier: true,
    },
  });
  if (!order) throw new Error("Pedido não encontrado");
  if (!RECEIVABLE.includes(order.status)) {
    throw new Error(
      `Pedido em status ${order.status} não permite recebimento`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const receipt = await tx.purchaseReceipt.create({
      data: {
        purchaseOrderId: order.id,
        notes: emptyToNull(input.notes) ?? null,
        userId,
      },
    });

    for (const line of input.items) {
      const poItem = order.items.find((i) => i.id === line.purchaseOrderItemId);
      if (!poItem || poItem.productId !== line.productId) {
        throw new Error("Item do pedido inválido no recebimento");
      }

      const pending =
        toNumber(poItem.quantity) - toNumber(poItem.qtyReceived);
      if (line.quantity > pending + 0.0001) {
        throw new Error(
          `Quantidade recebida excede o pendente do item (${poItem.product.name}). Pendente: ${pending}`,
        );
      }

      const product = poItem.product;
      let batchId: string | null = null;

      if (product.trackExpiry) {
        if (!line.batchCode?.trim()) {
          throw new Error(
            `Informe o lote para o produto ${product.name} (controla validade)`,
          );
        }
      }

      await applyStockDelta(
        {
          productId: product.id,
          delta: line.quantity,
          type: "PURCHASE_IN",
          originType: "PurchaseReceipt",
          originId: receipt.id,
          userId,
          reason: `Recebimento PC-${order.number}`,
          allowCreateBatch: product.trackExpiry
            ? {
                code: line.batchCode!.trim(),
                expiresAt: line.expiresAt ? new Date(line.expiresAt) : null,
                supplierId: order.supplierId,
                purchaseOrderId: order.id,
              }
            : line.batchCode?.trim()
              ? {
                  code: line.batchCode.trim(),
                  expiresAt: line.expiresAt ? new Date(line.expiresAt) : null,
                  supplierId: order.supplierId,
                  purchaseOrderId: order.id,
                }
              : undefined,
        },
        tx,
      );

      // recover batch id if created
      if (line.batchCode?.trim()) {
        const batch = await tx.batch.findFirst({
          where: {
            productId: product.id,
            code: line.batchCode.trim(),
          },
          orderBy: { createdAt: "desc" },
        });
        batchId = batch?.id ?? null;
      }

      // update product cost to last purchase cost
      const previousCost = toNumber(product.costPrice);
      if (roundMoney(line.unitCost) !== previousCost) {
        await tx.product.update({
          where: { id: product.id },
          data: { costPrice: roundMoney(line.unitCost) },
        });
        await tx.priceHistory.create({
          data: {
            productId: product.id,
            costPrice: roundMoney(line.unitCost),
            salePrice: product.salePrice,
            reason: `Recebimento PC-${order.number}`,
            changedBy: userId,
          },
        });
      }

      await tx.purchaseOrderItem.update({
        where: { id: poItem.id },
        data: {
          qtyReceived: roundMoney(toNumber(poItem.qtyReceived) + line.quantity),
          unitCost: roundMoney(line.unitCost),
        },
      });

      // keep in-memory qty for status calc
      (poItem as { qtyReceived: unknown }).qtyReceived =
        toNumber(poItem.qtyReceived) + line.quantity;

      await tx.purchaseReceiptItem.create({
        data: {
          purchaseReceiptId: receipt.id,
          productId: product.id,
          quantity: line.quantity,
          unitCost: roundMoney(line.unitCost),
          batchCode: emptyToNull(line.batchCode) ?? null,
          expiresAt: line.expiresAt ? new Date(line.expiresAt) : null,
          batchId,
          divergenceNotes: emptyToNull(line.divergenceNotes) ?? null,
        },
      });
    }

    // recompute status from DB items
    const freshItems = await tx.purchaseOrderItem.findMany({
      where: { purchaseOrderId: order.id },
    });
    const allReceived = freshItems.every(
      (i) => toNumber(i.qtyReceived) + 0.0001 >= toNumber(i.quantity),
    );
    const anyReceived = freshItems.some((i) => toNumber(i.qtyReceived) > 0);

    const nextStatus: PurchaseOrderStatus = allReceived
      ? "RECEIVED"
      : anyReceived
        ? "PARTIALLY_RECEIVED"
        : order.status;

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: nextStatus },
    });

    await writeAuditLog(
      {
        companyId,
        userId,
        action: "PURCHASE_RECEIVE",
        entityType: "PurchaseOrder",
        entityId: order.id,
        after: {
          receiptId: receipt.id,
          status: nextStatus,
          lines: input.items.length,
        },
      },
      tx,
    );

    return receipt;
  }).then(async (receipt) => {
    return {
      receipt,
      order: await getPurchaseOrder(companyId, purchaseOrderId),
    };
  });
}

export function purchaseOrderToText(order: NonNullable<
  Awaited<ReturnType<typeof getPurchaseOrder>>
>) {
  const lines = [
    `PEDIDO DE COMPRA Nº ${order.number}`,
    `Status: ${order.status}`,
    `Fornecedor: ${order.supplier.legalName}`,
    `Emissão: ${new Date(order.issueDate).toLocaleDateString("pt-BR")}`,
    order.expectedDate
      ? `Previsão: ${new Date(order.expectedDate).toLocaleDateString("pt-BR")}`
      : "",
    "",
    "ITENS:",
    ...order.items.map(
      (i) =>
        `- ${i.product.internalCode} ${i.product.name} | qtd ${i.quantity} | custo ${i.unitCost} | total ${i.total} | recebido ${i.qtyReceived}`,
    ),
    "",
    `Total produtos: ${order.productsTotal}`,
    `Desconto: ${order.discountTotal}`,
    `Frete: ${order.freight}`,
    `Outras despesas: ${order.otherExpenses}`,
    `TOTAL GERAL: ${order.grandTotal}`,
    order.paymentTerms ? `Pagamento: ${order.paymentTerms}` : "",
    order.notes ? `Obs: ${order.notes}` : "",
    `Responsável: ${order.user.name}`,
  ].filter(Boolean);

  return lines.join("\n");
}
