import { prisma } from "@/lib/prisma";
import { Prisma, StockMovementType } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit.service";
import { toNumber } from "@/lib/money";
import { isExpired, daysUntil, startOfDayTz } from "@/lib/date";
import type {
  ExpiryControlListQuery,
  ExpiryControlRegisterInput,
  StockAdjustBySupplierInput,
  StockAdjustInput,
} from "./stock.schema";

type Tx = Prisma.TransactionClient;

function todayStart(): Date {
  return startOfDayTz(new Date());
}

/** FEFO: available batches ordered by earliest expiry (nulls last) */
export async function getFefoBatches(
  productId: string,
  tx: Tx | typeof prisma = prisma,
) {
  const batches = await tx.batch.findMany({
    where: {
      productId,
      qtyAvailable: { gt: 0 },
    },
    orderBy: [{ expiresAt: "asc" }, { receivedAt: "asc" }],
  });

  // filter expired for sale purposes
  return batches.filter((b) => !b.expiresAt || !isExpired(b.expiresAt));
}

export async function allocateFefo(
  productId: string,
  quantity: number,
  tx: Tx,
): Promise<Array<{ batchId: string; qty: number }>> {
  if (quantity <= 0) throw new Error("Quantidade inválida");

  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Produto não encontrado");

  const stock = toNumber(product.currentStock);
  if (stock < quantity) {
    throw new Error(
      `Estoque insuficiente para ${product.name}. Disponível: ${stock}`,
    );
  }

  if (!product.trackExpiry) {
    return [{ batchId: "", qty: quantity }];
  }

  const batches = await getFefoBatches(productId, tx);
  let remaining = quantity;
  const allocations: Array<{ batchId: string; qty: number }> = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    const available = toNumber(batch.qtyAvailable);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    allocations.push({ batchId: batch.id, qty: take });
    remaining = round4(remaining - take);
  }

  if (remaining > 0.0001) {
    throw new Error(
      `Lotes disponíveis insuficientes (ou vencidos) para ${product.name}`,
    );
  }

  return allocations;
}

function round4(n: number) {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export async function applyStockDelta(
  params: {
    productId: string;
    batchId?: string | null;
    delta: number; // + in, - out
    type: StockMovementType;
    originType?: string;
    originId?: string;
    userId?: string;
    reason?: string;
    allowCreateBatch?: {
      code: string;
      expiresAt?: Date | null;
      supplierId?: string | null;
      purchaseOrderId?: string | null;
    };
  },
  tx: Tx,
) {
  const product = await tx.product.findUnique({
    where: { id: params.productId },
  });
  if (!product) throw new Error("Produto não encontrado");

  const qtyBefore = toNumber(product.currentStock);
  const qtyAfter = round4(qtyBefore + params.delta);

  if (qtyAfter < -0.0001) {
    throw new Error(
      `Operação resultaria em estoque negativo (${product.name})`,
    );
  }

  let batchId = params.batchId ?? null;

  if (product.trackExpiry) {
    if (params.delta > 0) {
      if (batchId) {
        const batch = await tx.batch.findUnique({ where: { id: batchId } });
        if (!batch || batch.productId !== product.id) {
          throw new Error("Lote inválido");
        }
        await tx.batch.update({
          where: { id: batchId },
          data: {
            qtyAvailable: round4(toNumber(batch.qtyAvailable) + params.delta),
            qtyReceived: round4(toNumber(batch.qtyReceived) + params.delta),
          },
        });
      } else if (params.allowCreateBatch) {
        const existing = await tx.batch.findUnique({
          where: {
            productId_code: {
              productId: product.id,
              code: params.allowCreateBatch.code,
            },
          },
        });
        if (existing) {
          await tx.batch.update({
            where: { id: existing.id },
            data: {
              qtyAvailable: round4(
                toNumber(existing.qtyAvailable) + params.delta,
              ),
              qtyReceived: round4(
                toNumber(existing.qtyReceived) + params.delta,
              ),
              expiresAt:
                params.allowCreateBatch.expiresAt ?? existing.expiresAt,
              supplierId:
                params.allowCreateBatch.supplierId ?? existing.supplierId,
              purchaseOrderId:
                params.allowCreateBatch.purchaseOrderId ??
                existing.purchaseOrderId,
            },
          });
          batchId = existing.id;
        } else {
          const created = await tx.batch.create({
            data: {
              productId: product.id,
              code: params.allowCreateBatch.code,
              expiresAt: params.allowCreateBatch.expiresAt ?? null,
              qtyReceived: params.delta,
              qtyAvailable: params.delta,
              supplierId: params.allowCreateBatch.supplierId ?? null,
              purchaseOrderId: params.allowCreateBatch.purchaseOrderId ?? null,
            },
          });
          batchId = created.id;
        }
      } else {
        throw new Error(
          "Produto com controle de validade exige lote na entrada",
        );
      }
    } else if (params.delta < 0) {
      if (!batchId) {
        throw new Error("Saída de produto com validade exige lote");
      }
      const batch = await tx.batch.findUnique({ where: { id: batchId } });
      if (!batch || batch.productId !== product.id) {
        throw new Error("Lote inválido");
      }
      // EXPIRY/LOSS/DAMAGE can use expired batches; sales should not reach here with expired
      const nextBatchQty = round4(toNumber(batch.qtyAvailable) + params.delta);
      if (nextBatchQty < -0.0001) {
        throw new Error(
          `Quantidade indisponível no lote ${batch.code}`,
        );
      }
      await tx.batch.update({
        where: { id: batchId },
        data: { qtyAvailable: Math.max(0, nextBatchQty) },
      });
    }
  }

  await tx.product.update({
    where: { id: product.id },
    data: { currentStock: Math.max(0, qtyAfter) },
  });

  const movement = await tx.stockMovement.create({
    data: {
      productId: product.id,
      batchId: batchId || null,
      type: params.type,
      qtyBefore,
      qtyDelta: params.delta,
      qtyAfter: Math.max(0, qtyAfter),
      originType: params.originType ?? null,
      originId: params.originId ?? null,
      userId: params.userId ?? null,
      reason: params.reason ?? null,
    },
  });

  return movement;
}

/** Confirm sale stock out with FEFO */
export async function stockOutFefo(
  params: {
    productId: string;
    quantity: number;
    type: StockMovementType;
    originType: string;
    originId: string;
    userId: string;
    reason?: string;
  },
  tx: Tx,
) {
  const allocations = await allocateFefo(
    params.productId,
    params.quantity,
    tx,
  );

  const movements = [];
  for (const alloc of allocations) {
    const mov = await applyStockDelta(
      {
        productId: params.productId,
        batchId: alloc.batchId || null,
        delta: -alloc.qty,
        type: params.type,
        originType: params.originType,
        originId: params.originId,
        userId: params.userId,
        reason: params.reason,
      },
      tx,
    );
    movements.push({ ...mov, batchId: alloc.batchId || null, qty: alloc.qty });
  }
  return movements;
}

/**
 * Ajuste de estoque sem cadastro de validade (validade só em Controle de validade).
 * Se o produto ainda usa lotes internamente, lote é criado/baixado de forma automática.
 */
export async function adjustStock(
  companyId: string,
  userId: string,
  input: StockAdjustInput,
) {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, companyId, deletedAt: null },
  });
  if (!product) throw new Error("Produto não encontrado");

  const isIn = input.type === "ADJUST_IN";
  const delta = isIn ? input.quantity : -input.quantity;

  return prisma.$transaction(async (tx) => {
    const audit = async (extra: Record<string, unknown> = {}) => {
      await writeAuditLog(
        {
          companyId,
          userId,
          action: "STOCK_ADJUST",
          entityType: "Product",
          entityId: product.id,
          after: {
            type: input.type,
            quantity: input.quantity,
            reason: input.reason,
            ...extra,
          },
        },
        tx,
      );
    };

    // Entrada com lotes internos: lote automático (UI de estoque não pede validade)
    if (product.trackExpiry && isIn && !input.batchId) {
      const code =
        input.batchCode?.trim() ||
        `AJ-${product.internalCode}-${Date.now().toString(36)}`;
      const movement = await applyStockDelta(
        {
          productId: product.id,
          delta,
          type: input.type as StockMovementType,
          originType: "StockAdjust",
          userId,
          reason: input.reason,
          allowCreateBatch: {
            code,
            // expiresAt opcional só via API legada/testes — não exposto na UI de estoque
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
        },
        tx,
      );
      await audit({ autoBatch: code });
      return movement;
    }

    // Saída com lotes: FEFO automático (sem o usuário escolher lote/validade)
    if (product.trackExpiry && !isIn && !input.batchId) {
      const movements = await stockOutFefo(
        {
          productId: product.id,
          quantity: input.quantity,
          type: input.type as StockMovementType,
          originType: "StockAdjust",
          originId: "adjust",
          userId,
          reason: input.reason,
        },
        tx,
      );
      await audit({ fefo: true });
      return movements;
    }

    const movement = await applyStockDelta(
      {
        productId: product.id,
        batchId: input.batchId ?? null,
        delta,
        type: input.type as StockMovementType,
        originType: "StockAdjust",
        userId,
        reason: input.reason,
      },
      tx,
    );
    await audit({ batchId: input.batchId ?? null });
    return movement;
  });
}

/** Mantém Product.expiresAt = próxima validade relevante (alerta/ordenação). */
async function syncProductNearestExpiry(
  productId: string,
  tx: Tx | typeof prisma = prisma,
) {
  const expiries = await tx.productExpiry.findMany({
    where: { productId },
    orderBy: { expiresAt: "asc" },
    select: { expiresAt: true },
  });

  if (expiries.length === 0) {
    await tx.product.update({
      where: { id: productId },
      data: { expiresAt: null },
    });
    return null;
  }

  const next =
    expiries.find((e) => !isExpired(e.expiresAt)) ??
    expiries[expiries.length - 1];

  await tx.product.update({
    where: { id: productId },
    data: { expiresAt: next.expiresAt },
  });
  return next.expiresAt;
}

/** Lista produtos com todas as validades de controle (várias por produto). */
export async function listExpiryControlProducts(
  companyId: string,
  query: ExpiryControlListQuery,
) {
  const where: Prisma.ProductWhereInput = {
    companyId,
    deletedAt: null,
    active: true,
  };

  if (query.mode === "with_stock") {
    where.currentStock = { gt: 0 };
  } else if (query.mode === "supplier") {
    if (!query.supplierId) {
      throw new Error("Selecione o fornecedor");
    }
    where.OR = [
      { supplierId: query.supplierId },
      {
        purchaseOrderItems: {
          some: {
            purchaseOrder: { supplierId: query.supplierId, companyId },
          },
        },
      },
      { batches: { some: { supplierId: query.supplierId } } },
    ];
  } else if (query.mode === "product") {
    if (!query.search?.trim()) {
      throw new Error("Informe o nome ou código do produto");
    }
  }

  if (query.search?.trim()) {
    const s = query.search.trim();
    const searchOr: Prisma.ProductWhereInput[] = [
      { name: { contains: s, mode: "insensitive" } },
      { internalCode: { contains: s, mode: "insensitive" } },
      { barcode: { contains: s, mode: "insensitive" } },
    ];
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchOr }];
      delete where.OR;
    } else {
      where.OR = searchOr;
    }
  }

  const alertDays = Number(
    (
      await prisma.setting.findFirst({
        where: { companyId, key: "days_to_expiry_alert" },
      })
    )?.value ?? 30,
  );

  const skip = (query.page - 1) * query.pageSize;
  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ expiresAt: "asc" }, { name: "asc" }],
      skip,
      take: query.pageSize,
      select: {
        id: true,
        internalCode: true,
        name: true,
        currentStock: true,
        expiresAt: true,
        supplier: {
          select: { id: true, legalName: true, tradeName: true },
        },
        unit: { select: { code: true } },
        expiryDates: {
          orderBy: { expiresAt: "asc" },
          select: {
            id: true,
            expiresAt: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  return {
    items: items.map((p) => {
      const stock = toNumber(p.currentStock);
      const expiries = p.expiryDates.map((e) => {
        const days = daysUntil(e.expiresAt);
        return {
          id: e.id,
          expiresAt: e.expiresAt,
          notes: e.notes,
          createdAt: e.createdAt,
          daysToExpiry: days,
          isExpired: isExpired(e.expiresAt),
          isExpiringSoon:
            days != null && days >= 0 && days <= alertDays,
        };
      });

      const next =
        expiries.find((e) => !e.isExpired) ??
        expiries[expiries.length - 1] ??
        null;
      const days = next ? next.daysToExpiry : null;

      return {
        id: p.id,
        internalCode: p.internalCode,
        name: p.name,
        currentStock: stock,
        unitCode: p.unit?.code ?? null,
        supplier: p.supplier,
        /** Próxima validade relevante (atalho). */
        expiresAt: next?.expiresAt ?? null,
        daysToExpiry: days,
        isExpired: next ? next.isExpired : false,
        isExpiringSoon: next ? next.isExpiringSoon : false,
        needsExpirySetup: expiries.length === 0,
        expiries,
      };
    }),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    daysToExpiryAlert: alertDays,
  };
}

/** Parse de data yyyy-mm-dd (input type=date) em meio-dia local — evita shift de fuso. */
function parseDateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      12,
      0,
      0,
      0,
    );
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Data inválida");
  return d;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Adiciona datas de validade aos produtos (histórico — várias por produto).
 * Independente de lotes de estoque.
 */
export async function registerExpiries(
  companyId: string,
  userId: string,
  input: ExpiryControlRegisterInput,
) {
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, companyId, deletedAt: null },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  if (products.length !== productIds.length) {
    throw new Error("Um ou mais produtos não foram encontrados");
  }

  let created = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of input.items) {
      const product = productMap.get(item.productId)!;
      let expiresAt: Date;
      try {
        expiresAt = parseDateOnly(item.expiresAt);
      } catch {
        throw new Error(`Data de validade inválida para ${product.name}`);
      }

      // evita duplicar a mesma data no mesmo produto
      const existingList = await tx.productExpiry.findMany({
        where: { productId: product.id },
      });
      const existingSameDay = existingList.find((e) =>
        sameCalendarDay(e.expiresAt, expiresAt),
      );
      if (existingSameDay) {
        if (item.notes?.trim()) {
          await tx.productExpiry.update({
            where: { id: existingSameDay.id },
            data: { notes: item.notes.trim() },
          });
        }
        await syncProductNearestExpiry(product.id, tx);
        continue;
      }

      await tx.productExpiry.create({
        data: {
          productId: product.id,
          expiresAt,
          notes: item.notes?.trim() || null,
          createdBy: userId,
        },
      });
      await syncProductNearestExpiry(product.id, tx);
      created += 1;
    }

    await writeAuditLog(
      {
        companyId,
        userId,
        action: "EXPIRY_CONTROL_REGISTER",
        entityType: "Product",
        entityId: productIds[0] ?? null,
        after: {
          created,
          items: input.items.map((i) => ({
            productId: i.productId,
            expiresAt: i.expiresAt,
            notes: i.notes ?? null,
          })),
        },
      },
      tx,
    );
  });

  return { created, updated: created };
}

/** Remove uma data de validade do histórico do produto. */
export async function deleteProductExpiry(
  companyId: string,
  userId: string,
  expiryId: string,
) {
  const expiry = await prisma.productExpiry.findFirst({
    where: {
      id: expiryId,
      product: { companyId, deletedAt: null },
    },
    include: {
      product: { select: { id: true, name: true } },
    },
  });
  if (!expiry) throw new Error("Validade não encontrada");

  await prisma.$transaction(async (tx) => {
    await tx.productExpiry.delete({ where: { id: expiryId } });
    await syncProductNearestExpiry(expiry.productId, tx);
    await writeAuditLog(
      {
        companyId,
        userId,
        action: "EXPIRY_CONTROL_DELETE",
        entityType: "Product",
        entityId: expiry.productId,
        before: {
          expiryId,
          expiresAt: expiry.expiresAt,
          notes: expiry.notes,
        },
      },
      tx,
    );
  });

  return { deleted: true, productId: expiry.productId };
}

/**
 * Produtos vinculados ao fornecedor:
 * cadastro (supplierId), compras ou lotes.
 */
export async function listProductsBySupplier(
  companyId: string,
  supplierId: string,
) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, companyId, deletedAt: null },
  });
  if (!supplier) throw new Error("Fornecedor não encontrado");

  const products = await prisma.product.findMany({
    where: {
      companyId,
      deletedAt: null,
      active: true,
      OR: [
        { supplierId },
        {
          purchaseOrderItems: {
            some: { purchaseOrder: { supplierId, companyId } },
          },
        },
        { batches: { some: { supplierId } } },
      ],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      internalCode: true,
      name: true,
      currentStock: true,
      trackExpiry: true,
      unit: { select: { id: true, code: true } },
    },
  });

  return {
    supplier: {
      id: supplier.id,
      legalName: supplier.legalName,
      tradeName: supplier.tradeName,
    },
    items: products.map((p) => ({
      ...p,
      currentStock: toNumber(p.currentStock),
    })),
  };
}

/**
 * Ajuste em lote a partir dos produtos de um fornecedor.
 * Entradas com validade geram lote automático vinculado ao fornecedor quando necessário.
 */
export async function adjustStockBySupplier(
  companyId: string,
  userId: string,
  input: StockAdjustBySupplierInput,
) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, companyId, deletedAt: null },
  });
  if (!supplier) throw new Error("Fornecedor não encontrado");

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      companyId,
      deletedAt: null,
    },
  });
  if (products.length !== new Set(productIds).size) {
    throw new Error("Um ou mais produtos não foram encontrados");
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  const results: unknown[] = [];

  await prisma.$transaction(async (tx) => {
    for (const item of input.items) {
      const product = productMap.get(item.productId)!;
      const isIn = item.type === "ADJUST_IN";
      const delta = isIn ? item.quantity : -item.quantity;
      const reason = `${input.reason} [fornecedor: ${supplier.tradeName || supplier.legalName}]`;

      if (product.trackExpiry && isIn && !item.batchId) {
        const batchCode =
          item.batchCode?.trim() ||
          `AJ-${supplier.id.slice(-6)}-${product.internalCode}-${Date.now().toString(36)}`;
        const movement = await applyStockDelta(
          {
            productId: product.id,
            delta,
            type: item.type as StockMovementType,
            originType: "StockAdjustBySupplier",
            originId: supplier.id,
            userId,
            reason,
            allowCreateBatch: {
              code: batchCode,
              expiresAt: null,
              supplierId: supplier.id,
            },
          },
          tx,
        );
        results.push(movement);
        continue;
      }

      if (!isIn && product.trackExpiry && !item.batchId) {
        const movements = await stockOutFefo(
          {
            productId: product.id,
            quantity: item.quantity,
            type: item.type as StockMovementType,
            originType: "StockAdjustBySupplier",
            originId: supplier.id,
            userId,
            reason,
          },
          tx,
        );
        results.push(...movements);
        continue;
      }

      const movement = await applyStockDelta(
        {
          productId: product.id,
          batchId: item.batchId ?? null,
          delta,
          type: item.type as StockMovementType,
          originType: "StockAdjustBySupplier",
          originId: supplier.id,
          userId,
          reason,
        },
        tx,
      );
      results.push(movement);
    }

    await writeAuditLog(
      {
        companyId,
        userId,
        action: "STOCK_ADJUST_BY_SUPPLIER",
        entityType: "Supplier",
        entityId: supplier.id,
        after: {
          reason: input.reason,
          itemCount: input.items.length,
          products: input.items.map((i) => ({
            productId: i.productId,
            type: i.type,
            quantity: i.quantity,
          })),
        },
      },
      tx,
    );
  });

  return {
    adjusted: input.items.length,
    movements: results.length,
  };
}

export async function listBatches(
  companyId: string,
  query: {
    page: number;
    pageSize: number;
    productId?: string;
    search?: string;
    status?: string;
    daysToExpiry?: number;
  },
) {
  const days =
    query.daysToExpiry ??
    Number(
      (
        await prisma.setting.findFirst({
          where: { companyId, key: "days_to_expiry_alert" },
        })
      )?.value ?? 30,
    );

  const where: Prisma.BatchWhereInput = {
    product: { companyId, deletedAt: null },
  };
  if (query.productId) where.productId = query.productId;
  if (query.search?.trim()) {
    where.OR = [
      { code: { contains: query.search.trim(), mode: "insensitive" } },
      { product: { name: { contains: query.search.trim(), mode: "insensitive" } } },
    ];
  }

  const now = todayStart();
  const alertDate = new Date(now);
  alertDate.setDate(alertDate.getDate() + days);

  if (query.status === "available") {
    where.qtyAvailable = { gt: 0 };
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gte: now } },
    ];
  } else if (query.status === "empty") {
    where.qtyAvailable = { lte: 0 };
  } else if (query.status === "expired") {
    where.expiresAt = { lt: now };
    where.qtyAvailable = { gt: 0 };
  } else if (query.status === "expiring") {
    where.expiresAt = { gte: now, lte: alertDate };
    where.qtyAvailable = { gt: 0 };
  }

  const skip = (query.page - 1) * query.pageSize;
  const [total, items] = await Promise.all([
    prisma.batch.count({ where }),
    prisma.batch.findMany({
      where,
      orderBy: [{ expiresAt: "asc" }, { receivedAt: "desc" }],
      skip,
      take: query.pageSize,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            internalCode: true,
            trackExpiry: true,
          },
        },
        supplier: { select: { id: true, tradeName: true, legalName: true } },
      },
    }),
  ]);

  return {
    items: items.map((b) => ({
      ...b,
      qtyReceived: toNumber(b.qtyReceived),
      qtyAvailable: toNumber(b.qtyAvailable),
      daysToExpiry: daysUntil(b.expiresAt),
      isExpired: b.expiresAt ? isExpired(b.expiresAt) : false,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    daysToExpiryAlert: days,
  };
}

export async function listMovements(
  companyId: string,
  opts: { page?: number; pageSize?: number; productId?: string } = {},
) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 30;
  const where: Prisma.StockMovementWhereInput = {
    product: { companyId },
  };
  if (opts.productId) where.productId = opts.productId;

  const [total, items] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        product: { select: { id: true, name: true, internalCode: true } },
        batch: { select: { id: true, code: true, expiresAt: true } },
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    items: items.map((m) => ({
      ...m,
      qtyBefore: toNumber(m.qtyBefore),
      qtyDelta: toNumber(m.qtyDelta),
      qtyAfter: toNumber(m.qtyAfter),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function createInventory(
  companyId: string,
  userId: string,
  notes?: string | null,
) {
  const count = await prisma.inventory.count({ where: { companyId } });
  const code = `INV-${String(count + 1).padStart(5, "0")}`;

  const products = await prisma.product.findMany({
    where: { companyId, active: true, deletedAt: null },
    include: {
      batches: {
        where: { qtyAvailable: { gt: 0 } },
      },
    },
  });

  return prisma.$transaction(async (tx) => {
    const inv = await tx.inventory.create({
      data: {
        companyId,
        code,
        status: "IN_PROGRESS",
        notes: notes ?? null,
        userId,
      },
    });

    for (const p of products) {
      if (p.trackExpiry && p.batches.length > 0) {
        for (const b of p.batches) {
          await tx.inventoryItem.create({
            data: {
              inventoryId: inv.id,
              productId: p.id,
              batchId: b.id,
              systemQty: b.qtyAvailable,
              countedQty: b.qtyAvailable,
              differenceQty: 0,
            },
          });
        }
      } else {
        await tx.inventoryItem.create({
          data: {
            inventoryId: inv.id,
            productId: p.id,
            batchId: null,
            systemQty: p.currentStock,
            countedQty: p.currentStock,
            differenceQty: 0,
          },
        });
      }
    }

    return inv;
  });
}

export async function getInventory(companyId: string, id: string) {
  const inv = await prisma.inventory.findFirst({
    where: { id, companyId },
    include: {
      user: { select: { id: true, name: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              internalCode: true,
              trackExpiry: true,
            },
          },
        },
        orderBy: { product: { name: "asc" } },
      },
    },
  });
  if (!inv) return null;

  return {
    ...inv,
    items: inv.items.map((i) => ({
      ...i,
      systemQty: toNumber(i.systemQty),
      countedQty: toNumber(i.countedQty),
      differenceQty: toNumber(i.differenceQty),
    })),
  };
}

export async function updateInventoryCounts(
  companyId: string,
  inventoryId: string,
  items: Array<{ productId: string; batchId?: string | null; countedQty: number }>,
) {
  const inv = await prisma.inventory.findFirst({
    where: { id: inventoryId, companyId },
  });
  if (!inv) throw new Error("Inventário não encontrado");
  if (inv.status !== "IN_PROGRESS" && inv.status !== "DRAFT") {
    throw new Error("Inventário não pode ser editado neste status");
  }

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const existing = await tx.inventoryItem.findFirst({
        where: {
          inventoryId,
          productId: item.productId,
          batchId: item.batchId ?? null,
        },
      });
      if (!existing) continue;
      const diff = round4(item.countedQty - toNumber(existing.systemQty));
      await tx.inventoryItem.update({
        where: { id: existing.id },
        data: {
          countedQty: item.countedQty,
          differenceQty: diff,
        },
      });
    }
  });

  return getInventory(companyId, inventoryId);
}

export async function confirmInventory(
  companyId: string,
  userId: string,
  inventoryId: string,
) {
  const inv = await prisma.inventory.findFirst({
    where: { id: inventoryId, companyId },
    include: { items: true },
  });
  if (!inv) throw new Error("Inventário não encontrado");
  if (inv.status === "CONFIRMED") throw new Error("Inventário já confirmado");
  if (inv.status === "CANCELLED") throw new Error("Inventário cancelado");

  return prisma.$transaction(async (tx) => {
    for (const item of inv.items) {
      const diff = toNumber(item.differenceQty);
      if (Math.abs(diff) < 0.0001) continue;

      await applyStockDelta(
        {
          productId: item.productId,
          batchId: item.batchId,
          delta: diff,
          type: "INVENTORY_ADJUST",
          originType: "Inventory",
          originId: inv.id,
          userId,
          reason: `Inventário ${inv.code}`,
          allowCreateBatch:
            diff > 0 && item.batchId
              ? undefined
              : diff > 0
                ? {
                    code: `INV-${inv.code}-${item.productId.slice(-4)}`,
                    expiresAt: null,
                  }
                : undefined,
        },
        tx,
      );
    }

    const updated = await tx.inventory.update({
      where: { id: inv.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });

    await writeAuditLog(
      {
        companyId,
        userId,
        action: "INVENTORY_CONFIRM",
        entityType: "Inventory",
        entityId: inv.id,
        after: { code: inv.code, items: inv.items.length },
      },
      tx,
    );

    return updated;
  });
}

export async function listInventories(companyId: string) {
  return prisma.inventory.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
    take: 50,
  });
}
