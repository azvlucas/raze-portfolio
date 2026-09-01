"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatPercent } from "@/lib/money";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DashboardData = {
  kpis: {
    grossRevenue: number;
    netRevenue: number;
    productCogs?: number;
    saleOverhead?: number;
    cogs: number;
    grossProfit: number;
    marginPercent: number;
    salesCount: number;
    avgTicket: number;
    unitsSold: number;
    customersServed: number;
    newCustomers: number;
    recurringCustomers: number;
    stockValueCost: number;
    stockValueSale: number;
    productsOutOfStock: number;
    productsLowStock: number;
    productsExpiring: number;
    productsExpired: number;
    pendingPurchases: number;
    pendingSales: number;
    purchaseTotal: number;
  };
  comparison: {
    grossRevenue: { current: number; previous: number; changePercent: number };
    salesCount: { current: number; previous: number; changePercent: number };
    avgTicket: { current: number; previous: number; changePercent: number };
    grossProfit: { current: number; previous: number; changePercent: number };
    purchaseTotal: { current: number; previous: number; changePercent: number };
  } | null;
  charts: {
    revenueByDay: Array<{
      label: string;
      revenue: number;
      profit: number;
      avgTicket: number;
      sales: number;
    }>;
    salesByCategory: Array<{ name: string; value: number }>;
    salesByChannel: Array<{ name: string; value: number }>;
    salesByPayment: Array<{ name: string; value: number }>;
    purchasesVsSales: Array<{ name: string; value: number }>;
  };
};

const COLORS = ["#ea580c", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];

function Delta({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={`text-xs font-medium ${positive ? "text-emerald-600" : "text-red-600"}`}
    >
      {positive ? "▲" : "▼"} {Math.abs(value).toFixed(1)}% vs período anterior
    </span>
  );
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function DashboardClient() {
  const range = defaultRange();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState<"day" | "ticket">("day");

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams({ from, to, compare: "true" });
      const res = await fetch(`/api/dashboard/strategic?${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro no dashboard");
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const k = data?.kpis;
  const c = data?.comparison;

  return (
    <div>
      <PageHeader
        title="Dashboard estratégico"
        description="Indicadores de faturamento, margem, estoque e comparação com o período anterior."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="mb-1 block text-xs">De</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-36"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Até</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-36"
              />
            </div>
            <Button size="sm" onClick={() => void load()}>
              Aplicar
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge>America/Sao_Paulo</Badge>
        <Badge variant="muted">BRL</Badge>
        {loading ? <Badge variant="warning">Atualizando…</Badge> : null}
      </div>

      {k ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Faturamento",
                value: formatBRL(k.grossRevenue),
                delta: c?.grossRevenue.changePercent,
              },
              {
                label: "Lucro bruto est.",
                value: formatBRL(k.grossProfit),
                delta: c?.grossProfit.changePercent,
              },
              {
                label: "Margem média",
                value: formatPercent(k.marginPercent),
              },
              {
                label: "Ticket médio",
                value: formatBRL(k.avgTicket),
                delta: c?.avgTicket.changePercent,
              },
              {
                label: "Vendas",
                value: String(k.salesCount),
                delta: c?.salesCount.changePercent,
              },
              {
                label: "Itens vendidos",
                value: k.unitsSold.toLocaleString("pt-BR"),
              },
              {
                label: "Clientes / novos",
                value: `${k.customersServed} / ${k.newCustomers}`,
              },
              {
                label: "Recorrentes",
                value: String(k.recurringCustomers),
              },
              {
                label: "Estoque (custo)",
                value: formatBRL(k.stockValueCost),
              },
              {
                label: "Estoque (venda)",
                value: formatBRL(k.stockValueSale),
              },
              {
                label: "Sem estoque / mínimo",
                value: `${k.productsOutOfStock} / ${k.productsLowStock}`,
              },
              {
                label: "Vencendo / vencidos",
                value: `${k.productsExpiring} / ${k.productsExpired}`,
              },
              {
                label: "Compras no período",
                value: formatBRL(k.purchaseTotal),
                delta: c?.purchaseTotal.changePercent,
              },
              {
                label: "Pedidos pendentes",
                value: `C ${k.pendingPurchases} · V ${k.pendingSales}`,
              },
              {
                label: "Custo produtos (CMV)",
                value: formatBRL(k.productCogs ?? k.cogs),
              },
              {
                label: "Custos de venda",
                value: formatBRL(k.saleOverhead ?? 0),
              },
              {
                label: "Custo total (CMV + venda)",
                value: formatBRL(k.cogs),
              },
              {
                label: "Faturamento líquido",
                value: formatBRL(k.netRevenue),
              },
            ].map((card) => (
              <Card key={card.label}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-zinc-500">
                    {card.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-semibold">{card.value}</div>
                  {card.delta != null ? <Delta value={card.delta} /> : null}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  {granularity === "day"
                    ? "Faturamento e lucro por dia"
                    : "Ticket médio por dia"}
                </CardTitle>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={granularity === "day" ? "default" : "outline"}
                    onClick={() => setGranularity("day")}
                  >
                    Fat./Lucro
                  </Button>
                  <Button
                    size="sm"
                    variant={granularity === "ticket" ? "default" : "outline"}
                    onClick={() => setGranularity("ticket")}
                  >
                    Ticket
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  {granularity === "day" ? (
                    <LineChart data={data.charts.revenueByDay}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v) => formatBRL(Number(v))}
                        contentStyle={{ borderRadius: 8 }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        name="Faturamento"
                        stroke="#ea580c"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        name="Lucro est."
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  ) : (
                    <LineChart data={data.charts.revenueByDay}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatBRL(Number(v))} />
                      <Line
                        type="monotone"
                        dataKey="avgTicket"
                        name="Ticket médio"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Compras vs vendas</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.purchasesVsSales}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => formatBRL(Number(v))} />
                    <Bar dataKey="value" name="Valor" fill="#ea580c" radius={6} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vendas por categoria</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.charts.salesByCategory}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={90}
                      label={({ name }) => name}
                    >
                      {data.charts.salesByCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatBRL(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Canal e forma de pagamento
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      ...data.charts.salesByChannel.map((d) => ({
                        ...d,
                        group: "Canal",
                      })),
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => formatBRL(Number(v))} />
                    <Bar dataKey="value" fill="#f59e0b" radius={6} name="Canal" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.charts.salesByPayment.map((p) => (
                    <Badge key={p.name} variant="muted">
                      {p.name}: {formatBRL(p.value)}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : loading ? (
        <p className="text-sm text-zinc-500">Carregando indicadores…</p>
      ) : (
        <p className="text-sm text-zinc-500">Sem dados para o período.</p>
      )}
    </div>
  );
}
