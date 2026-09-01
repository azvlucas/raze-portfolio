"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/money";

type RankRow = {
  id: string;
  name: string;
  code?: string;
  qty?: number;
  revenue?: number;
  profit?: number;
  orders?: number;
  ticketAvg?: number;
  stock?: number;
  qtySold?: number;
};

type Rankings = {
  productsByQty: RankRow[];
  productsByRevenue: RankRow[];
  productsByProfit: RankRow[];
  productsLowTurnover: RankRow[];
  productsNoSales: RankRow[];
  categoriesByRevenue: RankRow[];
  brandsByRevenue: RankRow[];
  customersByRevenue: RankRow[];
  customersByFrequency: RankRow[];
  customersByTicket: RankRow[];
  sellersByRevenue: RankRow[];
  sellersByOrders: RankRow[];
  suppliersByVolume: RankRow[];
  channelsByRevenue: RankRow[];
  couponsByUsage: RankRow[];
};

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function RankList({
  title,
  rows,
  valueKey = "revenue",
  format = "money",
}: {
  title: string;
  rows: RankRow[];
  valueKey?: keyof RankRow;
  format?: "money" | "number";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {!rows?.length ? (
          <p className="text-xs text-zinc-500">Sem dados</p>
        ) : (
          rows.map((r, i) => {
            const raw = r[valueKey];
            const display =
              format === "money"
                ? formatBRL(Number(raw ?? 0))
                : String(raw ?? "—");
            return (
              <div
                key={r.id + i}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  <span className="mr-1.5 text-zinc-400">#{i + 1}</span>
                  {r.name}
                  {r.code ? (
                    <span className="ml-1 text-xs text-zinc-500">{r.code}</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-medium">{display}</span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function RankingsClient() {
  const range = defaultRange();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [channel, setChannel] = useState("all");
  const [data, setData] = useState<Rankings | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams({ from, to, limit: "8", channel });
      const res = await fetch(`/api/dashboard/rankings?${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro");
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
  }, [from, to, channel]);

  return (
    <div>
      <PageHeader
        title="Rankings"
        description="Produtos, clientes, vendedores, canais e cupons no período."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="mb-1 block text-xs">De</Label>
              <Input
                type="date"
                className="h-9 w-36"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Até</Label>
              <Input
                type="date"
                className="h-9 w-36"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Canal</Label>
              <Select
                className="h-9 w-36"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="STORE">Loja</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="SITE">Site</option>
                <option value="OTHER">Outro</option>
              </Select>
            </div>
            <Button size="sm" onClick={() => void load()} disabled={loading}>
              Atualizar
            </Button>
          </div>
        }
      />

      {data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <RankList
            title="Produtos mais vendidos (qtd)"
            rows={data.productsByQty}
            valueKey="qty"
            format="number"
          />
          <RankList
            title="Produtos por faturamento"
            rows={data.productsByRevenue}
          />
          <RankList
            title="Produtos por lucro estimado"
            rows={data.productsByProfit}
            valueKey="profit"
          />
          <RankList
            title="Menor giro (estoque/vendas)"
            rows={data.productsLowTurnover}
            valueKey="qtySold"
            format="number"
          />
          <RankList
            title="Sem venda no período"
            rows={data.productsNoSales}
            valueKey="stock"
            format="number"
          />
          <RankList
            title="Categorias"
            rows={data.categoriesByRevenue}
          />
          <RankList title="Marcas" rows={data.brandsByRevenue} />
          <RankList
            title="Clientes · faturamento"
            rows={data.customersByRevenue}
          />
          <RankList
            title="Clientes · frequência"
            rows={data.customersByFrequency}
            valueKey="orders"
            format="number"
          />
          <RankList
            title="Clientes · ticket médio"
            rows={data.customersByTicket}
            valueKey="ticketAvg"
          />
          <RankList
            title="Vendedores · faturamento"
            rows={data.sellersByRevenue}
          />
          <RankList
            title="Vendedores · qtd vendas"
            rows={data.sellersByOrders}
            valueKey="orders"
            format="number"
          />
          <RankList
            title="Fornecedores · volume comprado"
            rows={data.suppliersByVolume}
          />
          <RankList title="Canais" rows={data.channelsByRevenue} />
          <RankList
            title="Cupons mais usados"
            rows={data.couponsByUsage}
            valueKey="orders"
            format="number"
          />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          {loading ? "Carregando rankings…" : "Sem dados"}
        </p>
      )}
    </div>
  );
}
