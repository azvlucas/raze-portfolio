import { prisma } from "@/lib/prisma";
import { Prisma, DiscountType, SaleChannel } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit.service";
import { toNumber, roundMoney } from "@/lib/money";
import type { CouponInput } from "./coupon.schema";

function emptyToNull(v?: string | null) {
  if (v === undefined) return undefined;
  if (v === null || String(v).trim() === "") return null;
  return String(v).trim();
}

export async function listCoupons(
  companyId: string,
  query: { page: number; pageSize: number; search?: string; active?: string },
) {
  const where: Prisma.CouponWhereInput = { companyId };
  if (query.active === "true") where.active = true;
  if (query.active === "false") where.active = false;
  if (query.search?.trim()) {
    where.OR = [
      { code: { contains: query.search.trim(), mode: "insensitive" } },
      { description: { contains: query.search.trim(), mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [total, items] = await Promise.all([
    prisma.coupon.count({ where }),
    prisma.coupon.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.pageSize,
      include: {
        _count: { select: { usages: true } },
        products: true,
        categories: true,
      },
    }),
  ]);

  return {
    items: items.map((c) => ({
      ...c,
      discountValue: toNumber(c.discountValue),
      minOrderValue: toNumber(c.minOrderValue),
      usageCount: c._count.usages,
      channels: c.channels ? c.channels.split(",").filter(Boolean) : [],
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getCoupon(companyId: string, id: string) {
  const coupon = await prisma.coupon.findFirst({
    where: { id, companyId },
    include: {
      products: true,
      categories: true,
      usages: {
        orderBy: { usedAt: "desc" },
        take: 20,
        include: {
          customer: { select: { id: true, name: true } },
          saleOrder: { select: { id: true, number: true } },
        },
      },
      _count: { select: { usages: true } },
    },
  });
  if (!coupon) return null;
  return {
    ...coupon,
    discountValue: toNumber(coupon.discountValue),
    minOrderValue: toNumber(coupon.minOrderValue),
    channels: coupon.channels ? coupon.channels.split(",").filter(Boolean) : [],
    productIds: coupon.products.map((p) => p.productId),
    categoryIds: coupon.categories.map((c) => c.categoryId),
    usageCount: coupon._count.usages,
  };
}

export async function createCoupon(
  companyId: string,
  userId: string,
  input: CouponInput,
) {
  const existing = await prisma.coupon.findFirst({
    where: { companyId, code: input.code },
  });
  if (existing) throw new Error("Já existe cupom com este código");

  if (input.discountType === "PERCENT" && input.discountValue > 100) {
    throw new Error("Desconto percentual não pode exceder 100%");
  }

  const coupon = await prisma.$transaction(async (tx) => {
    const created = await tx.coupon.create({
      data: {
        companyId,
        code: input.code,
        description: emptyToNull(input.description) ?? null,
        discountType: input.discountType as DiscountType,
        discountValue: input.discountValue,
        minOrderValue: input.minOrderValue,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        maxUses: input.maxUses ?? null,
        maxUsesPerCustomer: input.maxUsesPerCustomer ?? null,
        active: input.active ?? true,
        channels: (input.channels ?? []).join(",") || null,
        products: {
          create: (input.productIds ?? []).map((productId) => ({ productId })),
        },
        categories: {
          create: (input.categoryIds ?? []).map((categoryId) => ({
            categoryId,
          })),
        },
      },
    });
    await writeAuditLog(
      {
        companyId,
        userId,
        action: "CREATE",
        entityType: "Coupon",
        entityId: created.id,
        after: { code: created.code },
      },
      tx,
    );
    return created;
  });

  return getCoupon(companyId, coupon.id);
}

export async function updateCoupon(
  companyId: string,
  userId: string,
  id: string,
  input: CouponInput,
) {
  const current = await prisma.coupon.findFirst({ where: { id, companyId } });
  if (!current) throw new Error("Cupom não encontrado");

  if (input.discountType === "PERCENT" && input.discountValue > 100) {
    throw new Error("Desconto percentual não pode exceder 100%");
  }

  await prisma.$transaction(async (tx) => {
    await tx.couponProduct.deleteMany({ where: { couponId: id } });
    await tx.couponCategory.deleteMany({ where: { couponId: id } });
    await tx.coupon.update({
      where: { id },
      data: {
        code: input.code,
        description: emptyToNull(input.description) ?? null,
        discountType: input.discountType as DiscountType,
        discountValue: input.discountValue,
        minOrderValue: input.minOrderValue,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        maxUses: input.maxUses ?? null,
        maxUsesPerCustomer: input.maxUsesPerCustomer ?? null,
        active: input.active ?? true,
        channels: (input.channels ?? []).join(",") || null,
        products: {
          create: (input.productIds ?? []).map((productId) => ({ productId }),
          ),
        },
        categories: {
          create: (input.categoryIds ?? []).map((categoryId) => ({
            categoryId,
          })),
        },
      },
    });
    await writeAuditLog(
      {
        companyId,
        userId,
        action: "UPDATE",
        entityType: "Coupon",
        entityId: id,
        after: { code: input.code },
      },
      tx,
    );
  });

  return getCoupon(companyId, id);
}

export type CouponValidationContext = {
  companyId: string;
  code: string;
  orderSubtotal: number;
  channel: SaleChannel | string;
  customerId?: string | null;
  productIds?: string[];
  categoryIds?: string[];
};

export async function validateAndComputeCoupon(
  ctx: CouponValidationContext,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const coupon = await tx.coupon.findFirst({
    where: {
      companyId: ctx.companyId,
      code: ctx.code.trim().toUpperCase(),
    },
    include: {
      products: true,
      categories: true,
      _count: { select: { usages: true } },
    },
  });

  if (!coupon || !coupon.active) {
    throw new Error("Cupom inválido ou inativo");
  }

  const now = new Date();
  if (coupon.startsAt > now) throw new Error("Cupom ainda não iniciado");
  if (coupon.endsAt && coupon.endsAt < now) throw new Error("Cupom expirado");

  if (coupon.maxUses != null && coupon._count.usages >= coupon.maxUses) {
    throw new Error("Cupom esgotado (limite total de usos)");
  }

  if (ctx.customerId && coupon.maxUsesPerCustomer != null) {
    const usedByCustomer = await tx.couponUsage.count({
      where: { couponId: coupon.id, customerId: ctx.customerId },
    });
    if (usedByCustomer >= coupon.maxUsesPerCustomer) {
      throw new Error("Limite de uso do cupom por cliente atingido");
    }
  }

  if (toNumber(coupon.minOrderValue) > 0 && ctx.orderSubtotal < toNumber(coupon.minOrderValue)) {
    throw new Error(
      `Valor mínimo do pedido para o cupom: ${toNumber(coupon.minOrderValue)}`,
    );
  }

  if (coupon.channels) {
    const allowed = coupon.channels.split(",").filter(Boolean);
    if (allowed.length && !allowed.includes(String(ctx.channel))) {
      throw new Error("Cupom não válido para este canal de venda");
    }
  }

  if (coupon.products.length) {
    const allowed = new Set(coupon.products.map((p) => p.productId));
    const has = (ctx.productIds ?? []).some((id) => allowed.has(id));
    if (!has) throw new Error("Cupom não se aplica aos produtos do pedido");
  }

  if (coupon.categories.length) {
    const allowed = new Set(coupon.categories.map((c) => c.categoryId));
    const has = (ctx.categoryIds ?? []).some((id) => allowed.has(id));
    if (!has) throw new Error("Cupom não se aplica às categorias do pedido");
  }

  let discount = 0;
  if (coupon.discountType === "PERCENT") {
    discount = roundMoney((ctx.orderSubtotal * toNumber(coupon.discountValue)) / 100);
  } else {
    discount = roundMoney(Math.min(toNumber(coupon.discountValue), ctx.orderSubtotal));
  }

  return {
    coupon,
    discountAmount: discount,
  };
}
