import { prisma } from "@/lib/prisma";
import { SaleOrderStatus } from "@/generated/prisma/client";
import { toNumber, roundMoney } from "@/lib/money";
import { resolvePeriod } from "./dashboard.service";
import type { RankingsQuery } from "./report.schema";

const COMPLETED: SaleOrderStatus[] = ["COMPLETED", "CONFIRMED"];

export async function getRankings(companyId: string, query: RankingsQuery) {
  const { start, end } = resolvePeriod(query.from, query.to);
  const limit = query.limit;

  const sales = await prisma.saleOrder.findMany({
    where: {
      companyId,
      status: { in: COMPLETED },
      saleDate: { gte: start, lte: end },
      ...(query.channel && query.channel !== "all"
        ? { channel: query.channel as never }
        : {}),
      ...(query.sellerId ? { sellerId: query.sellerId } : {}),
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              internalCode: true,
              categoryId: true,
              brandId: true,
              category: { select: { name: true } },
              brand: { select: { name: true } },
              currentStock: true,
            },
          },
        },
      },
      customer: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
      payments: {
        include: { paymentMethod: { select: { name: true } } },
      },
      coupon: { select: { id: true, code: true } },
    },
  });

  type Acc = {
    id: string;
    name: string;
    code?: string;
    qty: number;
    revenue: number;
    cost: number;
    orders: number;
  };

  const products = new Map<string, Acc>();
  const categories = new Map<string, Acc>();
  const brands = new Map<string, Acc>();
  const customers = new Map<string, Acc & { tickets: number[] }>();
  const sellers = new Map<string, Acc>();
  const channels = new Map<string, Acc>();
  const coupons = new Map<string, Acc>();
  const productSoldIds = new Set<string>();

  for (const sale of sales) {
    // channel
    {
      const key = sale.channel;
      const row = channels.get(key) ?? {
        id: key,
        name: key,
        qty: 0,
        revenue: 0,
        cost: 0,
        orders: 0,
      };
      row.revenue += toNumber(sale.total);
      row.orders += 1;
      channels.set(key, row);
    }

    // seller
    if (sale.seller) {
      const key = sale.seller.id;
      const row = sellers.get(key) ?? {
        id: key,
        name: sale.seller.name,
        qty: 0,
        revenue: 0,
        cost: 0,
        orders: 0,
      };
      row.revenue += toNumber(sale.total);
      row.orders += 1;
      sellers.set(key, row);
    }

    // customer
    if (sale.customer) {
      const key = sale.customer.id;
      const row = customers.get(key) ?? {
        id: key,
        name: sale.customer.name,
        qty: 0,
        revenue: 0,
        cost: 0,
        orders: 0,
        tickets: [],
      };
      row.revenue += toNumber(sale.total);
      row.orders += 1;
      row.tickets.push(toNumber(sale.total));
      customers.set(key, row);
    }

    // coupon
    if (sale.coupon) {
      const key = sale.coupon.id;
      const row = coupons.get(key) ?? {
        id: key,
        name: sale.coupon.code,
        code: sale.coupon.code,
        qty: 0,
        revenue: 0,
        cost: 0,
        orders: 0,
      };
      row.orders += 1;
      row.revenue += toNumber(sale.total);
      coupons.set(key, row);
    }

    for (const item of sale.items) {
      const p = item.product;
      if (query.categoryId && p.categoryId !== query.categoryId) continue;
      if (query.brandId && p.brandId !== query.brandId) continue;

      productSoldIds.add(p.id);
      const qty = toNumber(item.quantity);
      const rev = toNumber(item.total);
      const cost = toNumber(item.unitCost) * qty;

      {
        const row = products.get(p.id) ?? {
          id: p.id,
          name: p.name,
          code: p.internalCode,
          qty: 0,
          revenue: 0,
          cost: 0,
          orders: 0,
        };
        row.qty += qty;
        row.revenue += rev;
        row.cost += cost;
        products.set(p.id, row);
      }

      if (p.category) {
        const row = categories.get(p.categoryId!) ?? {
          id: p.categoryId!,
          name: p.category.name,
          qty: 0,
          revenue: 0,
          cost: 0,
          orders: 0,
        };
        row.qty += qty;
        row.revenue += rev;
        categories.set(p.categoryId!, row);
      }

      if (p.brand && p.brandId) {
        const row = brands.get(p.brandId) ?? {
          id: p.brandId,
          name: p.brand.name,
          qty: 0,
          revenue: 0,
          cost: 0,
          orders: 0,
        };
        row.qty += qty;
        row.revenue += rev;
        brands.set(p.brandId, row);
      }
    }
  }

  const mapTop = (
    map: Map<string, Acc>,
    sortKey: "qty" | "revenue" | "profit" | "orders" | "ticket",
  ) => {
    const arr = [...map.values()].map((r) => ({
      ...r,
      qty: roundMoney(r.qty),
      revenue: roundMoney(r.revenue),
      cost: roundMoney(r.cost),
      profit: roundMoney(r.revenue - r.cost),
      ticketAvg:
        r.orders > 0 ? roundMoney(r.revenue / r.orders) : 0,
    }));
    arr.sort((a, b) => {
      if (sortKey === "profit") return b.profit - a.profit;
      if (sortKey === "ticket") return b.ticketAvg - a.ticketAvg;
      return (b[sortKey] as number) - (a[sortKey] as number);
    });
    return arr.slice(0, limit);
  };

  // Low turnover / no sales
  const allProducts = await prisma.product.findMany({
    where: { companyId, deletedAt: null, active: true },
    select: {
      id: true,
      name: true,
      internalCode: true,
      currentStock: true,
      costPrice: true,
    },
  });

  const noSales = allProducts
    .filter((p) => !productSoldIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.internalCode,
      stock: toNumber(p.currentStock),
      stockValue: roundMoney(toNumber(p.currentStock) * toNumber(p.costPrice)),
    }))
    .sort((a, b) => b.stockValue - a.stockValue)
    .slice(0, limit);

  const lowTurnover = [...products.values()]
    .filter((p) => p.qty > 0)
    .map((p) => {
      const prod = allProducts.find((x) => x.id === p.id);
      const stock = prod ? toNumber(prod.currentStock) : 0;
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        qtySold: roundMoney(p.qty),
        stock,
        // higher stock / lower sales = worse turnover
        score: p.qty > 0 ? stock / p.qty : Infinity,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Suppliers by purchase volume
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      companyId,
      status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] },
      issueDate: { gte: start, lte: end },
    },
    include: {
      supplier: { select: { id: true, legalName: true, tradeName: true } },
    },
  });
  const supplierMap = new Map<string, Acc>();
  for (const po of purchaseOrders) {
    const key = po.supplierId;
    const row = supplierMap.get(key) ?? {
      id: key,
      name: po.supplier.tradeName || po.supplier.legalName,
      qty: 0,
      revenue: 0,
      cost: 0,
      orders: 0,
    };
    row.revenue += toNumber(po.grandTotal);
    row.orders += 1;
    supplierMap.set(key, row);
  }

  const customersList = [...customers.values()].map((c) => ({
    ...c,
    revenue: roundMoney(c.revenue),
    ticketAvg: c.orders ? roundMoney(c.revenue / c.orders) : 0,
  }));

  return {
    period: { from: start.toISOString(), to: end.toISOString() },
    productsByQty: mapTop(products, "qty"),
    productsByRevenue: mapTop(products, "revenue"),
    productsByProfit: mapTop(products, "profit"),
    productsLowTurnover: lowTurnover,
    productsNoSales: noSales,
    categoriesByRevenue: mapTop(categories, "revenue"),
    brandsByRevenue: mapTop(brands, "revenue"),
    customersByRevenue: customersList
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit),
    customersByFrequency: customersList
      .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
      .slice(0, limit),
    customersByTicket: customersList
      .filter((c) => c.orders > 0)
      .sort((a, b) => b.ticketAvg - a.ticketAvg)
      .slice(0, limit),
    sellersByRevenue: mapTop(sellers, "revenue"),
    sellersByOrders: mapTop(sellers, "orders"),
    suppliersByVolume: mapTop(supplierMap, "revenue"),
    channelsByRevenue: mapTop(channels, "revenue"),
    couponsByUsage: mapTop(coupons, "orders"),
  };
}
