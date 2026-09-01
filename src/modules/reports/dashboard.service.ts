import { prisma } from "@/lib/prisma";
import {
  PurchaseOrderStatus,
  SaleOrderStatus,
} from "@/generated/prisma/client";
import { toNumber, roundMoney } from "@/lib/money";
import { isExpired, daysUntil, startOfDayTz, endOfDayTz } from "@/lib/date";
import { sumSaleOverheadForSales } from "@/modules/sale-costs/sale-cost.service";
import {
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  format,
  subDays,
  differenceInCalendarDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";

const COMPLETED: SaleOrderStatus[] = ["COMPLETED", "CONFIRMED"];

export function resolvePeriod(from?: string, to?: string) {
  const end = to ? endOfDayTz(new Date(to)) : endOfDayTz(new Date());
  const start = from
    ? startOfDayTz(new Date(from))
    : startOfDayTz(subDays(end, 29));
  return { start, end };
}

function previousPeriod(start: Date, end: Date) {
  const days = Math.max(1, differenceInCalendarDays(end, start) + 1);
  const prevEnd = startOfDayTz(subDays(start, 1));
  const prevStart = startOfDayTz(subDays(prevEnd, days - 1));
  return { start: prevStart, end: endOfDayTz(prevEnd) };
}

async function salesInRange(companyId: string, start: Date, end: Date) {
  return prisma.saleOrder.findMany({
    where: {
      companyId,
      status: { in: COMPLETED },
      saleDate: { gte: start, lte: end },
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              categoryId: true,
              brandId: true,
              category: { select: { name: true } },
              brand: { select: { name: true } },
            },
          },
        },
      },
      payments: {
        include: { paymentMethod: { select: { name: true, code: true } } },
      },
      customer: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
    },
  });
}

async function purchasesInRange(companyId: string, start: Date, end: Date) {
  return prisma.purchaseOrder.findMany({
    where: {
      companyId,
      status: {
        in: [
          "RECEIVED",
          "PARTIALLY_RECEIVED",
          "APPROVED",
          "SENT_TO_SUPPLIER",
        ] as PurchaseOrderStatus[],
      },
      issueDate: { gte: start, lte: end },
    },
    include: {
      supplier: { select: { id: true, legalName: true, tradeName: true } },
      items: true,
    },
  });
}

function aggregateSales(
  sales: Awaited<ReturnType<typeof salesInRange>>,
  /** Custos comuns de venda (embalagem, taxas etc.) já somados no período */
  saleOverhead = 0,
) {
  const gross = roundMoney(
    sales.reduce((s, o) => s + toNumber(o.total), 0),
  );
  // net ≈ gross - order discounts already in total; cost from items
  let productCogs = 0;
  let units = 0;
  for (const o of sales) {
    for (const i of o.items) {
      productCogs += toNumber(i.unitCost) * toNumber(i.quantity);
      units += toNumber(i.quantity);
    }
  }
  productCogs = roundMoney(productCogs);
  const overhead = roundMoney(saleOverhead);
  const cogs = roundMoney(productCogs + overhead);
  const net = gross; // total already net of discounts
  const profit = roundMoney(net - cogs);
  const margin = net > 0 ? roundMoney((profit / net) * 100) : 0;
  const customers = new Set(
    sales.map((s) => s.customerId).filter(Boolean) as string[],
  );
  const ticket = sales.length ? roundMoney(gross / sales.length) : 0;

  return {
    grossRevenue: gross,
    netRevenue: net,
    /** Custo dos produtos vendidos (CMV) */
    productCogs,
    /** Custos comuns de venda no período */
    saleOverhead: overhead,
    /** CMV + custos de venda */
    cogs,
    grossProfit: profit,
    marginPercent: margin,
    salesCount: sales.length,
    avgTicket: ticket,
    unitsSold: roundMoney(units),
    customersServed: customers.size,
  };
}

export async function getStrategicDashboard(
  companyId: string,
  from?: string,
  to?: string,
  compare = true,
) {
  const period = resolvePeriod(from, to);
  const prev = previousPeriod(period.start, period.end);

  const [sales, prevSales, purchases, prevPurchases, products, settings] =
    await Promise.all([
      salesInRange(companyId, period.start, period.end),
      compare
        ? salesInRange(companyId, prev.start, prev.end)
        : Promise.resolve([]),
      purchasesInRange(companyId, period.start, period.end),
      compare
        ? purchasesInRange(companyId, prev.start, prev.end)
        : Promise.resolve([]),
      prisma.product.findMany({
        where: { companyId, deletedAt: null, active: true },
        select: {
          id: true,
          currentStock: true,
          minStock: true,
          costPrice: true,
          salePrice: true,
          trackExpiry: true,
        },
      }),
      prisma.setting.findFirst({
        where: { companyId, key: "days_to_expiry_alert" },
      }),
    ]);

  const [overhead, prevOverhead] = await Promise.all([
    sumSaleOverheadForSales(companyId, sales),
    compare
      ? sumSaleOverheadForSales(companyId, prevSales)
      : Promise.resolve(0),
  ]);

  const metrics = aggregateSales(sales, overhead);
  const prevMetrics = aggregateSales(prevSales, prevOverhead);

  const purchaseTotal = roundMoney(
    purchases.reduce((s, p) => s + toNumber(p.grandTotal), 0),
  );
  const prevPurchaseTotal = roundMoney(
    prevPurchases.reduce((s, p) => s + toNumber(p.grandTotal), 0),
  );

  // New vs recurring customers in period
  const customerFirstSale = await prisma.saleOrder.groupBy({
    by: ["customerId"],
    where: {
      companyId,
      status: { in: COMPLETED },
      customerId: { not: null },
    },
    _min: { saleDate: true },
  });
  const firstMap = new Map(
    customerFirstSale
      .filter((c) => c.customerId)
      .map((c) => [c.customerId!, c._min.saleDate!]),
  );

  let newCustomers = 0;
  let recurringCustomers = 0;
  const periodCustomerIds = new Set(
    sales.map((s) => s.customerId).filter(Boolean) as string[],
  );
  for (const cid of periodCustomerIds) {
    const first = firstMap.get(cid);
    if (first && first >= period.start && first <= period.end) {
      newCustomers += 1;
    } else {
      recurringCustomers += 1;
    }
  }

  // Stock valuation
  let stockCost = 0;
  let stockSale = 0;
  let outOfStock = 0;
  let lowStock = 0;
  for (const p of products) {
    const qty = toNumber(p.currentStock);
    stockCost += qty * toNumber(p.costPrice);
    stockSale += qty * toNumber(p.salePrice);
    if (qty <= 0) outOfStock += 1;
    else if (qty <= toNumber(p.minStock)) lowStock += 1;
  }

  const daysAlert = Number(settings?.value ?? 30);
  const batches = await prisma.batch.findMany({
    where: {
      product: { companyId, deletedAt: null },
      qtyAvailable: { gt: 0 },
      expiresAt: { not: null },
    },
    select: { expiresAt: true, qtyAvailable: true },
  });
  let expiring = 0;
  let expired = 0;
  for (const b of batches) {
    if (!b.expiresAt) continue;
    if (isExpired(b.expiresAt)) expired += 1;
    else {
      const d = daysUntil(b.expiresAt);
      if (d != null && d <= daysAlert) expiring += 1;
    }
  }

  const [pendingPurchases, pendingSales] = await Promise.all([
    prisma.purchaseOrder.count({
      where: {
        companyId,
        status: {
          in: [
            "DRAFT",
            "AWAITING_APPROVAL",
            "APPROVED",
            "SENT_TO_SUPPLIER",
            "PARTIALLY_RECEIVED",
          ],
        },
      },
    }),
    prisma.saleOrder.count({
      where: {
        companyId,
        status: {
          in: ["DRAFT", "QUOTE", "AWAITING_PAYMENT", "CONFIRMED", "SEPARATING"],
        },
      },
    }),
  ]);

  // Charts data (profit already nets common sale costs)
  const { getActiveSaleCosts, computeSaleOverhead } = await import(
    "@/modules/sale-costs/sale-cost.service"
  );
  const activeSaleCosts = await getActiveSaleCosts(companyId);

  const days = eachDayOfInterval({ start: period.start, end: period.end });
  const byDayMap = new Map<string, { revenue: number; profit: number; sales: number; ticketSum: number }>();
  for (const d of days) {
    byDayMap.set(format(d, "yyyy-MM-dd"), {
      revenue: 0,
      profit: 0,
      sales: 0,
      ticketSum: 0,
    });
  }
  for (const o of sales) {
    const key = format(o.saleDate, "yyyy-MM-dd");
    const row = byDayMap.get(key);
    if (!row) continue;
    const total = toNumber(o.total);
    let cost = 0;
    for (const i of o.items) {
      cost += toNumber(i.unitCost) * toNumber(i.quantity);
    }
    cost += computeSaleOverhead(total, activeSaleCosts);
    row.revenue += total;
    row.profit += total - cost;
    row.sales += 1;
    row.ticketSum += total;
  }

  const revenueByDay = [...byDayMap.entries()].map(([date, v]) => ({
    date,
    label: format(new Date(date + "T12:00:00"), "dd/MM", { locale: ptBR }),
    revenue: roundMoney(v.revenue),
    profit: roundMoney(v.profit),
    sales: v.sales,
    avgTicket: v.sales ? roundMoney(v.ticketSum / v.sales) : 0,
  }));

  // Week / month buckets for longer ranges
  const weeks = eachWeekOfInterval(
    { start: period.start, end: period.end },
    { weekStartsOn: 1 },
  );
  const revenueByWeek = weeks.map((w) => {
    const key = format(w, "yyyy-MM-dd");
    const endW = endOfDayTz(
      new Date(w.getTime() + 6 * 24 * 60 * 60 * 1000),
    );
    const subset = sales.filter(
      (s) => s.saleDate >= w && s.saleDate <= endW,
    );
    const revenue = roundMoney(
      subset.reduce((a, s) => a + toNumber(s.total), 0),
    );
    return {
      date: key,
      label: format(w, "dd/MM", { locale: ptBR }),
      revenue,
      sales: subset.length,
    };
  });

  const months = eachMonthOfInterval({
    start: period.start,
    end: period.end,
  });
  const revenueByMonth = months.map((m) => {
    const key = format(m, "yyyy-MM");
    const subset = sales.filter(
      (s) => format(s.saleDate, "yyyy-MM") === key,
    );
    return {
      date: key,
      label: format(m, "MMM/yy", { locale: ptBR }),
      revenue: roundMoney(
        subset.reduce((a, s) => a + toNumber(s.total), 0),
      ),
      sales: subset.length,
    };
  });

  // By category
  const catMap = new Map<string, number>();
  const channelMap = new Map<string, number>();
  const payMap = new Map<string, number>();
  for (const o of sales) {
    channelMap.set(
      o.channel,
      (channelMap.get(o.channel) ?? 0) + toNumber(o.total),
    );
    for (const p of o.payments) {
      const name = p.paymentMethod.name;
      payMap.set(name, (payMap.get(name) ?? 0) + toNumber(p.amount));
    }
    for (const i of o.items) {
      const cat = i.product.category?.name || "Sem categoria";
      catMap.set(cat, (catMap.get(cat) ?? 0) + toNumber(i.total));
    }
  }

  const delta = (cur: number, prev: number) => {
    if (prev === 0) return cur === 0 ? 0 : 100;
    return roundMoney(((cur - prev) / prev) * 100);
  };

  return {
    period: {
      from: period.start.toISOString(),
      to: period.end.toISOString(),
    },
    previousPeriod: compare
      ? { from: prev.start.toISOString(), to: prev.end.toISOString() }
      : null,
    kpis: {
      ...metrics,
      newCustomers,
      recurringCustomers,
      stockValueCost: roundMoney(stockCost),
      stockValueSale: roundMoney(stockSale),
      productsOutOfStock: outOfStock,
      productsLowStock: lowStock,
      productsExpiring: expiring,
      productsExpired: expired,
      pendingPurchases,
      pendingSales,
      purchaseTotal,
    },
    comparison: compare
      ? {
          grossRevenue: {
            current: metrics.grossRevenue,
            previous: prevMetrics.grossRevenue,
            changePercent: delta(metrics.grossRevenue, prevMetrics.grossRevenue),
          },
          salesCount: {
            current: metrics.salesCount,
            previous: prevMetrics.salesCount,
            changePercent: delta(metrics.salesCount, prevMetrics.salesCount),
          },
          avgTicket: {
            current: metrics.avgTicket,
            previous: prevMetrics.avgTicket,
            changePercent: delta(metrics.avgTicket, prevMetrics.avgTicket),
          },
          grossProfit: {
            current: metrics.grossProfit,
            previous: prevMetrics.grossProfit,
            changePercent: delta(metrics.grossProfit, prevMetrics.grossProfit),
          },
          purchaseTotal: {
            current: purchaseTotal,
            previous: prevPurchaseTotal,
            changePercent: delta(purchaseTotal, prevPurchaseTotal),
          },
        }
      : null,
    charts: {
      revenueByDay,
      revenueByWeek,
      revenueByMonth,
      salesByCategory: [...catMap.entries()]
        .map(([name, value]) => ({ name, value: roundMoney(value) }))
        .sort((a, b) => b.value - a.value),
      salesByChannel: [...channelMap.entries()]
        .map(([name, value]) => ({ name, value: roundMoney(value) }))
        .sort((a, b) => b.value - a.value),
      salesByPayment: [...payMap.entries()]
        .map(([name, value]) => ({ name, value: roundMoney(value) }))
        .sort((a, b) => b.value - a.value),
      purchasesVsSales: [
        { name: "Vendas", value: metrics.grossRevenue },
        { name: "Compras", value: purchaseTotal },
      ],
    },
  };
}
