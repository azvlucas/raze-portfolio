import { prisma } from "@/lib/prisma";
import { toNumber, roundMoney } from "@/lib/money";
import { isExpired, daysUntil, formatDateBR } from "@/lib/date";
import { resolvePeriod } from "./dashboard.service";
import type { ReportQuery } from "./report.schema";

function csvEscape(v: string | number | boolean | null | undefined) {
  const s = v == null ? "" : String(v);
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
) {
  const lines = [headers.join(";")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(";"));
  }
  return "\uFEFF" + lines.join("\n");
}

export async function runReport(companyId: string, query: ReportQuery) {
  const { start, end } = resolvePeriod(query.from, query.to);

  switch (query.type) {
    case "stock_current": {
      const products = await prisma.product.findMany({
        where: { companyId, deletedAt: null },
        include: {
          category: { select: { name: true } },
          brand: { select: { name: true } },
          unit: { select: { code: true } },
        },
        orderBy: { name: "asc" },
      });
      const rows = products.map((p) => ({
        code: p.internalCode,
        name: p.name,
        category: p.category?.name ?? "",
        brand: p.brand?.name ?? "",
        unit: p.unit.code,
        stock: toNumber(p.currentStock),
        minStock: toNumber(p.minStock),
        cost: toNumber(p.costPrice),
        price: toNumber(p.salePrice),
        valueCost: roundMoney(toNumber(p.currentStock) * toNumber(p.costPrice)),
        valueSale: roundMoney(toNumber(p.currentStock) * toNumber(p.salePrice)),
        active: p.active,
      }));
      return {
        title: "Estoque atual",
        rows,
        csv: toCsv(
          [
            "codigo",
            "nome",
            "categoria",
            "marca",
            "unidade",
            "estoque",
            "minimo",
            "custo",
            "preco",
            "valor_custo",
            "valor_venda",
            "ativo",
          ],
          rows.map((r) => [
            r.code,
            r.name,
            r.category,
            r.brand,
            r.unit,
            r.stock,
            r.minStock,
            r.cost,
            r.price,
            r.valueCost,
            r.valueSale,
            r.active ? "sim" : "nao",
          ]),
        ),
      };
    }

    case "stock_low":
    case "stock_out": {
      const products = await prisma.product.findMany({
        where: { companyId, deletedAt: null, active: true },
        include: { category: { select: { name: true } } },
        orderBy: { name: "asc" },
      });
      const filtered = products.filter((p) => {
        const stock = toNumber(p.currentStock);
        if (query.type === "stock_out") return stock <= 0;
        return stock > 0 && stock <= toNumber(p.minStock);
      });
      const rows = filtered.map((p) => ({
        code: p.internalCode,
        name: p.name,
        category: p.category?.name ?? "",
        stock: toNumber(p.currentStock),
        minStock: toNumber(p.minStock),
      }));
      return {
        title:
          query.type === "stock_out"
            ? "Produtos sem estoque"
            : "Estoque abaixo do mínimo",
        rows,
        csv: toCsv(
          ["codigo", "nome", "categoria", "estoque", "minimo"],
          rows.map((r) => [r.code, r.name, r.category, r.stock, r.minStock]),
        ),
      };
    }

    case "stock_movements": {
      const movements = await prisma.stockMovement.findMany({
        where: {
          product: { companyId },
          createdAt: { gte: start, lte: end },
        },
        orderBy: { createdAt: "desc" },
        take: 2000,
        include: {
          product: { select: { internalCode: true, name: true } },
          batch: { select: { code: true } },
          user: { select: { name: true } },
        },
      });
      const rows = movements.map((m) => ({
        date: m.createdAt.toISOString(),
        product: m.product.name,
        code: m.product.internalCode,
        type: m.type,
        delta: toNumber(m.qtyDelta),
        before: toNumber(m.qtyBefore),
        after: toNumber(m.qtyAfter),
        batch: m.batch?.code ?? "",
        user: m.user?.name ?? "",
        reason: m.reason ?? "",
      }));
      return {
        title: "Movimentações de estoque",
        rows,
        csv: toCsv(
          [
            "data",
            "produto",
            "codigo",
            "tipo",
            "delta",
            "antes",
            "depois",
            "lote",
            "usuario",
            "motivo",
          ],
          rows.map((r) => [
            r.date,
            r.product,
            r.code,
            r.type,
            r.delta,
            r.before,
            r.after,
            r.batch,
            r.user,
            r.reason,
          ]),
        ),
      };
    }

    case "expiring":
    case "expired": {
      const batches = await prisma.batch.findMany({
        where: {
          product: { companyId, deletedAt: null },
          qtyAvailable: { gt: 0 },
          expiresAt: { not: null },
        },
        include: {
          product: { select: { internalCode: true, name: true } },
        },
        orderBy: { expiresAt: "asc" },
      });
      const rows = batches
        .filter((b) => {
          if (!b.expiresAt) return false;
          if (query.type === "expired") return isExpired(b.expiresAt);
          const d = daysUntil(b.expiresAt);
          return d != null && d >= 0 && d <= query.daysToExpiry;
        })
        .map((b) => ({
          product: b.product.name,
          code: b.product.internalCode,
          batch: b.code,
          expiresAt: b.expiresAt?.toISOString().slice(0, 10) ?? "",
          days: daysUntil(b.expiresAt),
          qty: toNumber(b.qtyAvailable),
        }));
      return {
        title:
          query.type === "expired"
            ? "Produtos vencidos"
            : "Produtos próximos do vencimento",
        rows,
        csv: toCsv(
          ["produto", "codigo", "lote", "validade", "dias", "qtd"],
          rows.map((r) => [
            r.product,
            r.code,
            r.batch,
            r.expiresAt,
            r.days,
            r.qty,
          ]),
        ),
      };
    }

    case "purchases_period": {
      const orders = await prisma.purchaseOrder.findMany({
        where: {
          companyId,
          issueDate: { gte: start, lte: end },
        },
        include: {
          supplier: { select: { legalName: true, tradeName: true } },
          user: { select: { name: true } },
        },
        orderBy: { number: "desc" },
      });
      const rows = orders.map((o) => ({
        number: o.number,
        supplier: o.supplier.tradeName || o.supplier.legalName,
        status: o.status,
        date: o.issueDate.toISOString().slice(0, 10),
        total: toNumber(o.grandTotal),
        user: o.user.name,
      }));
      return {
        title: "Compras por período",
        rows,
        csv: toCsv(
          ["numero", "fornecedor", "status", "data", "total", "usuario"],
          rows.map((r) => [
            r.number,
            r.supplier,
            r.status,
            r.date,
            r.total,
            r.user,
          ]),
        ),
      };
    }

    case "sales_period":
    case "sales_by_product":
    case "sales_by_category":
    case "sales_by_customer":
    case "sales_by_seller":
    case "sales_by_channel":
    case "margin_by_product": {
      const sales = await prisma.saleOrder.findMany({
        where: {
          companyId,
          status: { in: ["COMPLETED", "CONFIRMED"] },
          saleDate: { gte: start, lte: end },
        },
        include: {
          customer: { select: { name: true } },
          seller: { select: { name: true } },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  internalCode: true,
                  category: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { saleDate: "desc" },
      });

      if (query.type === "sales_period") {
        const rows = sales.map((s) => ({
          number: s.number,
          date: s.saleDate.toISOString().slice(0, 10),
          customer: s.customer?.name ?? "Consumidor",
          channel: s.channel,
          seller: s.seller?.name ?? "",
          total: toNumber(s.total),
          status: s.status,
        }));
        return {
          title: "Vendas por período",
          rows,
          csv: toCsv(
            ["numero", "data", "cliente", "canal", "vendedor", "total", "status"],
            rows.map((r) => [
              r.number,
              r.date,
              r.customer,
              r.channel,
              r.seller,
              r.total,
              r.status,
            ]),
          ),
        };
      }

      if (query.type === "sales_by_channel") {
        const map = new Map<string, { channel: string; orders: number; total: number }>();
        for (const s of sales) {
          const row = map.get(s.channel) ?? {
            channel: s.channel,
            orders: 0,
            total: 0,
          };
          row.orders += 1;
          row.total += toNumber(s.total);
          map.set(s.channel, row);
        }
        const rows = [...map.values()]
          .map((r) => ({ ...r, total: roundMoney(r.total) }))
          .sort((a, b) => b.total - a.total);
        return {
          title: "Vendas por canal",
          rows,
          csv: toCsv(
            ["canal", "pedidos", "total"],
            rows.map((r) => [r.channel, r.orders, r.total]),
          ),
        };
      }

      if (query.type === "sales_by_seller") {
        const map = new Map<
          string,
          { seller: string; orders: number; total: number }
        >();
        for (const s of sales) {
          const name = s.seller?.name ?? "Sem vendedor";
          const row = map.get(name) ?? { seller: name, orders: 0, total: 0 };
          row.orders += 1;
          row.total += toNumber(s.total);
          map.set(name, row);
        }
        const rows = [...map.values()]
          .map((r) => ({ ...r, total: roundMoney(r.total) }))
          .sort((a, b) => b.total - a.total);
        return {
          title: "Vendas por vendedor",
          rows,
          csv: toCsv(
            ["vendedor", "pedidos", "total"],
            rows.map((r) => [r.seller, r.orders, r.total]),
          ),
        };
      }

      if (query.type === "sales_by_customer") {
        const map = new Map<
          string,
          { customer: string; orders: number; total: number }
        >();
        for (const s of sales) {
          const name = s.customer?.name ?? "Consumidor";
          const row = map.get(name) ?? { customer: name, orders: 0, total: 0 };
          row.orders += 1;
          row.total += toNumber(s.total);
          map.set(name, row);
        }
        const rows = [...map.values()]
          .map((r) => ({ ...r, total: roundMoney(r.total) }))
          .sort((a, b) => b.total - a.total);
        return {
          title: "Vendas por cliente",
          rows,
          csv: toCsv(
            ["cliente", "pedidos", "total"],
            rows.map((r) => [r.customer, r.orders, r.total]),
          ),
        };
      }

      // by product / category / margin
      const map = new Map<
        string,
        {
          key: string;
          name: string;
          code: string;
          qty: number;
          revenue: number;
          cost: number;
        }
      >();
      for (const s of sales) {
        for (const i of s.items) {
          const isCat = query.type === "sales_by_category";
          const key = isCat
            ? i.product.category?.name || "Sem categoria"
            : i.product.id;
          const name = isCat
            ? i.product.category?.name || "Sem categoria"
            : i.product.name;
          const code = isCat ? "" : i.product.internalCode;
          const row = map.get(key) ?? {
            key,
            name,
            code,
            qty: 0,
            revenue: 0,
            cost: 0,
          };
          row.qty += toNumber(i.quantity);
          row.revenue += toNumber(i.total);
          row.cost += toNumber(i.unitCost) * toNumber(i.quantity);
          map.set(key, row);
        }
      }
      const rows = [...map.values()]
        .map((r) => ({
          name: r.name,
          code: r.code,
          qty: roundMoney(r.qty),
          revenue: roundMoney(r.revenue),
          cost: roundMoney(r.cost),
          profit: roundMoney(r.revenue - r.cost),
          margin:
            r.revenue > 0
              ? roundMoney(((r.revenue - r.cost) / r.revenue) * 100)
              : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      const title =
        query.type === "sales_by_category"
          ? "Vendas por categoria"
          : query.type === "margin_by_product"
            ? "Margem por produto"
            : "Vendas por produto";

      return {
        title,
        rows,
        csv: toCsv(
          ["nome", "codigo", "qtd", "receita", "custo", "lucro", "margem_pct"],
          rows.map((r) => [
            r.name,
            r.code,
            r.qty,
            r.revenue,
            r.cost,
            r.profit,
            r.margin,
          ]),
        ),
      };
    }

    case "customers_inactive": {
      const customers = await prisma.customer.findMany({
        where: { companyId, deletedAt: null, active: true },
        include: {
          saleOrders: {
            where: { status: { in: ["COMPLETED", "CONFIRMED"] } },
            orderBy: { saleDate: "desc" },
            take: 1,
            select: { saleDate: true, total: true },
          },
        },
      });
      const now = Date.now();
      const rows = customers
        .map((c) => {
          const last = c.saleOrders[0]?.saleDate;
          const days = last
            ? Math.floor((now - last.getTime()) / 86400000)
            : 9999;
          return {
            name: c.name,
            phone: c.whatsapp || c.phone || "",
            email: c.email || "",
            lastPurchase: last ? last.toISOString().slice(0, 10) : "",
            days,
            marketingConsent: c.marketingConsent,
          };
        })
        .filter((r) => r.days >= query.daysInactive)
        .sort((a, b) => b.days - a.days);
      return {
        title: `Clientes sem compra há ${query.daysInactive}+ dias`,
        rows,
        csv: toCsv(
          ["nome", "telefone", "email", "ultima_compra", "dias", "consentimento"],
          rows.map((r) => [
            r.name,
            r.phone,
            r.email,
            r.lastPurchase,
            r.days,
            r.marketingConsent ? "sim" : "nao",
          ]),
        ),
      };
    }

    case "birthdays": {
      const month = new Date().getMonth() + 1;
      const customers = await prisma.customer.findMany({
        where: {
          companyId,
          deletedAt: null,
          active: true,
          birthDate: { not: null },
        },
        select: {
          name: true,
          birthDate: true,
          whatsapp: true,
          phone: true,
          email: true,
        },
      });
      const pets = await prisma.pet.findMany({
        where: {
          active: true,
          birthDate: { not: null },
          customer: { companyId, deletedAt: null, active: true },
        },
        include: {
          customer: { select: { name: true, whatsapp: true, phone: true } },
        },
      });
      const customerRows = customers
        .filter((c) => c.birthDate && c.birthDate.getMonth() + 1 === month)
        .map((c) => ({
          type: "cliente",
          name: c.name,
          birthday: formatDateBR(c.birthDate),
          contact: c.whatsapp || c.phone || c.email || "",
        }));
      const petRows = pets
        .filter((p) => p.birthDate && p.birthDate.getMonth() + 1 === month)
        .map((p) => ({
          type: "pet",
          name: `${p.name} (tutor: ${p.customer.name})`,
          birthday: formatDateBR(p.birthDate),
          contact: p.customer.whatsapp || p.customer.phone || "",
        }));
      const rows = [...customerRows, ...petRows];
      return {
        title: "Aniversariantes do mês",
        rows,
        csv: toCsv(
          ["tipo", "nome", "aniversario", "contato"],
          rows.map((r) => [r.type, r.name, r.birthday, r.contact]),
        ),
      };
    }

    case "coupon_usage": {
      const usages = await prisma.couponUsage.findMany({
        where: {
          usedAt: { gte: start, lte: end },
          coupon: { companyId },
        },
        include: {
          coupon: { select: { code: true } },
          customer: { select: { name: true } },
          saleOrder: { select: { number: true, total: true } },
        },
        orderBy: { usedAt: "desc" },
      });
      const rows = usages.map((u) => ({
        coupon: u.coupon.code,
        date: u.usedAt.toISOString().slice(0, 10),
        customer: u.customer?.name ?? "",
        sale: u.saleOrder.number,
        discount: toNumber(u.discountAmount),
        saleTotal: toNumber(u.saleOrder.total),
      }));
      return {
        title: "Uso de cupons",
        rows,
        csv: toCsv(
          ["cupom", "data", "cliente", "venda", "desconto", "total_venda"],
          rows.map((r) => [
            r.coupon,
            r.date,
            r.customer,
            r.sale,
            r.discount,
            r.saleTotal,
          ]),
        ),
      };
    }

    case "campaigns": {
      const campaigns = await prisma.campaign.findMany({
        where: { companyId },
        include: {
          coupon: { select: { code: true } },
          _count: { select: { customers: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      const rows = campaigns.map((c) => ({
        name: c.name,
        channel: c.channel,
        status: c.status,
        segment: c.segmentKey ?? "",
        contacts: c._count.customers,
        coupon: c.coupon?.code ?? "",
        createdAt: c.createdAt.toISOString().slice(0, 10),
      }));
      return {
        title: "Resultados de campanhas",
        rows,
        csv: toCsv(
          [
            "nome",
            "canal",
            "status",
            "segmento",
            "contatos",
            "cupom",
            "criada_em",
          ],
          rows.map((r) => [
            r.name,
            r.channel,
            r.status,
            r.segment,
            r.contacts,
            r.coupon,
            r.createdAt,
          ]),
        ),
      };
    }

    default:
      throw new Error("Tipo de relatório inválido");
  }
}
