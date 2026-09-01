import { prisma } from "@/lib/prisma";
import {
  Prisma,
  CustomerOrigin,
  SaleChannel,
  SaleOrderStatus,
} from "@/generated/prisma/client";
import { toNumber, roundMoney } from "@/lib/money";
import type { SegmentFilters, SegmentQuery } from "./crm.schema";

const COMPLETED: SaleOrderStatus[] = ["COMPLETED", "CONFIRMED"];

export type CustomerMetrics = {
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  origin: string;
  marketingConsent: boolean;
  createdAt: Date;
  firstPurchase: Date | null;
  lastPurchase: Date | null;
  orderCount: number;
  totalSpent: number;
  ticketAvg: number;
  daysSinceLast: number | null;
  topChannel: string | null;
  tags: string[];
};

function daysBetween(from: Date, to: Date = new Date()) {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/** Compute metrics for all active customers from completed sales */
export async function computeCustomerMetrics(
  companyId: string,
): Promise<CustomerMetrics[]> {
  const customers = await prisma.customer.findMany({
    where: { companyId, deletedAt: null, active: true },
    include: {
      tags: { include: { tag: true } },
      saleOrders: {
        where: { status: { in: COMPLETED } },
        select: {
          saleDate: true,
          total: true,
          channel: true,
        },
        orderBy: { saleDate: "asc" },
      },
    },
  });

  return customers.map((c) => {
    const orders = c.saleOrders;
    const orderCount = orders.length;
    const totalSpent = roundMoney(
      orders.reduce((s, o) => s + toNumber(o.total), 0),
    );
    const ticketAvg = orderCount ? roundMoney(totalSpent / orderCount) : 0;
    const firstPurchase = orders[0]?.saleDate ?? null;
    const lastPurchase = orders[orders.length - 1]?.saleDate ?? null;
    const daysSinceLast = lastPurchase ? daysBetween(lastPurchase) : null;

    const channelCount = new Map<string, number>();
    for (const o of orders) {
      channelCount.set(o.channel, (channelCount.get(o.channel) ?? 0) + 1);
    }
    const topChannel =
      [...channelCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      customerId: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      whatsapp: c.whatsapp,
      city: c.city,
      state: c.state,
      origin: c.origin,
      marketingConsent: c.marketingConsent,
      createdAt: c.createdAt,
      firstPurchase,
      lastPurchase,
      orderCount,
      totalSpent,
      ticketAvg,
      daysSinceLast,
      topChannel,
      tags: c.tags.map((t) => t.tag.name),
    };
  });
}

function applyQuickPreset(
  filters: SegmentFilters,
  quick: SegmentQuery["quick"],
): SegmentFilters {
  const f = { ...filters };
  const now = new Date();
  switch (quick) {
    case "new":
      f.newCustomersDays = f.newCustomersDays ?? 30;
      break;
    case "recurring":
      f.recurring = true;
      break;
    case "once":
      f.onlyOnce = true;
      break;
    case "inactive_30":
      f.lastPurchaseDaysMin = 30;
      break;
    case "inactive_60":
      f.lastPurchaseDaysMin = 60;
      break;
    case "inactive_90":
      f.lastPurchaseDaysMin = 90;
      break;
    case "birthday_month":
      f.birthdayMonth = now.getMonth() + 1;
      break;
    case "pet_birthday_month":
      f.petBirthdayMonth = now.getMonth() + 1;
      break;
    default:
      break;
  }
  return f;
}

async function filterByProductOrCategory(
  companyId: string,
  productId?: string,
  categoryId?: string,
  channel?: string,
): Promise<Set<string> | null> {
  if (!productId && !categoryId && !channel) return null;

  const where: Prisma.SaleOrderWhereInput = {
    companyId,
    status: { in: COMPLETED },
    customerId: { not: null },
  };
  if (channel) where.channel = channel as SaleChannel;
  if (productId || categoryId) {
    where.items = {
      some: {
        ...(productId ? { productId } : {}),
        ...(categoryId ? { product: { categoryId } } : {}),
      },
    };
  }

  const orders = await prisma.saleOrder.findMany({
    where,
    select: { customerId: true },
    distinct: ["customerId"],
  });

  return new Set(
    orders.map((o) => o.customerId).filter((id): id is string => !!id),
  );
}

async function birthdayCustomerIds(
  companyId: string,
  month: number,
): Promise<Set<string>> {
  const customers = await prisma.customer.findMany({
    where: {
      companyId,
      deletedAt: null,
      active: true,
      birthDate: { not: null },
    },
    select: { id: true, birthDate: true },
  });
  return new Set(
    customers
      .filter((c) => c.birthDate && c.birthDate.getMonth() + 1 === month)
      .map((c) => c.id),
  );
}

async function petBirthdayCustomerIds(
  companyId: string,
  month: number,
): Promise<Set<string>> {
  const pets = await prisma.pet.findMany({
    where: {
      active: true,
      birthDate: { not: null },
      customer: { companyId, deletedAt: null, active: true },
    },
    select: { customerId: true, birthDate: true },
  });
  return new Set(
    pets
      .filter((p) => p.birthDate && p.birthDate.getMonth() + 1 === month)
      .map((p) => p.customerId),
  );
}

export async function segmentCustomers(
  companyId: string,
  query: SegmentQuery,
) {
  const filters = applyQuickPreset(query, query.quick);

  // Product buyers quick filter via productId in query
  let metrics = await computeCustomerMetrics(companyId);

  const productSet = await filterByProductOrCategory(
    companyId,
    filters.productId,
    filters.categoryId,
    filters.channel,
  );
  if (productSet) {
    metrics = metrics.filter((m) => productSet.has(m.customerId));
  }

  if (filters.birthdayMonth) {
    const ids = await birthdayCustomerIds(companyId, filters.birthdayMonth);
    metrics = metrics.filter((m) => ids.has(m.customerId));
  }

  if (filters.petBirthdayMonth) {
    const ids = await petBirthdayCustomerIds(
      companyId,
      filters.petBirthdayMonth,
    );
    metrics = metrics.filter((m) => ids.has(m.customerId));
  }

  if (filters.origin && filters.origin !== "all") {
    metrics = metrics.filter((m) => m.origin === filters.origin);
  }
  if (filters.city) {
    const city = filters.city.toLowerCase();
    metrics = metrics.filter((m) => m.city?.toLowerCase().includes(city));
  }
  if (filters.state) {
    metrics = metrics.filter(
      (m) => m.state?.toUpperCase() === filters.state!.toUpperCase(),
    );
  }
  if (filters.tag) {
    const tag = filters.tag.toLowerCase();
    metrics = metrics.filter((m) =>
      m.tags.some((t) => t.toLowerCase() === tag),
    );
  }
  if (filters.marketingConsentOnly) {
    metrics = metrics.filter((m) => m.marketingConsent);
  }
  if (filters.onlyOnce) {
    metrics = metrics.filter((m) => m.orderCount === 1);
  }
  if (filters.recurring) {
    metrics = metrics.filter((m) => m.orderCount >= 2);
  }
  if (filters.minOrders != null) {
    metrics = metrics.filter((m) => m.orderCount >= filters.minOrders!);
  }
  if (filters.maxOrders != null) {
    metrics = metrics.filter((m) => m.orderCount <= filters.maxOrders!);
  }
  if (filters.minTotalSpent != null) {
    metrics = metrics.filter((m) => m.totalSpent >= filters.minTotalSpent!);
  }
  if (filters.maxTotalSpent != null) {
    metrics = metrics.filter((m) => m.totalSpent <= filters.maxTotalSpent!);
  }
  if (filters.minTicket != null) {
    metrics = metrics.filter((m) => m.ticketAvg >= filters.minTicket!);
  }
  if (filters.maxTicket != null) {
    metrics = metrics.filter((m) => m.ticketAvg <= filters.maxTicket!);
  }
  if (filters.lastPurchaseDaysMin != null) {
    metrics = metrics.filter(
      (m) =>
        m.daysSinceLast != null &&
        m.daysSinceLast >= filters.lastPurchaseDaysMin!,
    );
  }
  if (filters.lastPurchaseDaysMax != null) {
    metrics = metrics.filter(
      (m) =>
        m.daysSinceLast != null &&
        m.daysSinceLast <= filters.lastPurchaseDaysMax!,
    );
  }
  if (filters.newCustomersDays != null) {
    const cutoff = Date.now() - filters.newCustomersDays * 86400000;
    metrics = metrics.filter((m) => m.createdAt.getTime() >= cutoff);
  }

  // Sorting
  const dir = query.sortDir === "asc" ? 1 : -1;
  metrics.sort((a, b) => {
    switch (query.sortBy) {
      case "name":
        return a.name.localeCompare(b.name) * dir;
      case "orderCount":
        return (a.orderCount - b.orderCount) * dir;
      case "lastPurchase": {
        const at = a.lastPurchase?.getTime() ?? 0;
        const bt = b.lastPurchase?.getTime() ?? 0;
        return (at - bt) * dir;
      }
      case "ticketAvg":
        return (a.ticketAvg - b.ticketAvg) * dir;
      case "totalSpent":
      default:
        return (a.totalSpent - b.totalSpent) * dir;
    }
  });

  // Quick presets for top lists: already sorted by totalSpent/frequency
  if (query.quick === "top_revenue") {
    metrics = metrics.filter((m) => m.orderCount > 0);
  }
  if (query.quick === "top_frequency") {
    metrics = metrics
      .filter((m) => m.orderCount > 0)
      .sort((a, b) => b.orderCount - a.orderCount || b.totalSpent - a.totalSpent);
  }

  const total = metrics.length;
  const skip = (query.page - 1) * query.pageSize;
  const items = metrics.slice(skip, skip + query.pageSize);

  // Summary cards
  const withPurchases = metrics.filter((m) => m.orderCount > 0);
  const summary = {
    totalCustomers: total,
    withPurchases: withPurchases.length,
    totalRevenue: roundMoney(
      withPurchases.reduce((s, m) => s + m.totalSpent, 0),
    ),
    avgTicket: withPurchases.length
      ? roundMoney(
          withPurchases.reduce((s, m) => s + m.ticketAvg, 0) /
            withPurchases.length,
        )
      : 0,
    inactive30: metrics.filter(
      (m) => m.daysSinceLast != null && m.daysSinceLast >= 30,
    ).length,
    marketingOk: metrics.filter((m) => m.marketingConsent).length,
  };

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    summary,
    filtersApplied: filters,
  };
}

export async function resolveCustomerIdsForSegment(
  companyId: string,
  filters: SegmentFilters & { quick?: SegmentQuery["quick"] },
  options?: { requireMarketingConsent?: boolean; channel?: string },
) {
  const result = await segmentCustomers(companyId, {
    ...filters,
    quick: filters.quick ?? "all",
    page: 1,
    pageSize: 10000,
    sortBy: "totalSpent",
    sortDir: "desc",
  });

  let items = result.items;
  if (options?.requireMarketingConsent) {
    items = items.filter((m) => m.marketingConsent);
  }
  return items.map((m) => m.customerId);
}

export async function getCrmOverview(companyId: string) {
  const metrics = await computeCustomerMetrics(companyId);
  const withPurchases = metrics.filter((m) => m.orderCount > 0);
  const now = new Date();
  const month = now.getMonth() + 1;

  const birthdayIds = await birthdayCustomerIds(companyId, month);
  const petBirthdayIds = await petBirthdayCustomerIds(companyId, month);

  return {
    totalCustomers: metrics.length,
    withPurchases: withPurchases.length,
    oneShot: metrics.filter((m) => m.orderCount === 1).length,
    recurring: metrics.filter((m) => m.orderCount >= 2).length,
    inactive30: metrics.filter(
      (m) => m.daysSinceLast != null && m.daysSinceLast >= 30,
    ).length,
    inactive60: metrics.filter(
      (m) => m.daysSinceLast != null && m.daysSinceLast >= 60,
    ).length,
    inactive90: metrics.filter(
      (m) => m.daysSinceLast != null && m.daysSinceLast >= 90,
    ).length,
    totalRevenue: roundMoney(
      withPurchases.reduce((s, m) => s + m.totalSpent, 0),
    ),
    avgTicket: withPurchases.length
      ? roundMoney(
          withPurchases.reduce((s, m) => s + m.ticketAvg, 0) /
            withPurchases.length,
        )
      : 0,
    marketingConsent: metrics.filter((m) => m.marketingConsent).length,
    birthdayThisMonth: birthdayIds.size,
    petBirthdayThisMonth: petBirthdayIds.size,
    topCustomers: [...withPurchases]
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10),
    topFrequency: [...withPurchases]
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 10),
  };
}

export function metricsToCsv(rows: CustomerMetrics[]) {
  const header = [
    "nome",
    "email",
    "telefone",
    "whatsapp",
    "cidade",
    "uf",
    "origem",
    "consentimento",
    "qtd_compras",
    "total_gasto",
    "ticket_medio",
    "primeira_compra",
    "ultima_compra",
    "dias_sem_compra",
    "canal_preferido",
    "tags",
  ];
  const escape = (v: string | number | boolean | null | undefined) => {
    const s = v == null ? "" : String(v);
    if (s.includes(";") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        r.email,
        r.phone,
        r.whatsapp,
        r.city,
        r.state,
        r.origin,
        r.marketingConsent ? "sim" : "nao",
        r.orderCount,
        r.totalSpent,
        r.ticketAvg,
        r.firstPurchase?.toISOString().slice(0, 10) ?? "",
        r.lastPurchase?.toISOString().slice(0, 10) ?? "",
        r.daysSinceLast,
        r.topChannel,
        r.tags.join("|"),
      ]
        .map(escape)
        .join(";"),
    );
  }
  return "\uFEFF" + lines.join("\n");
}

// silence unused import if any
void CustomerOrigin;
