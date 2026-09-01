"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

type SizeRow = {
  size: "SMALL" | "MEDIUM" | "LARGE";
  label: string;
  shortLabel: string;
  productCount: number;
};

type AnalysisData = {
  totalActiveProducts: number;
  productsWithoutSize: number;
  bySize: SizeRow[];
};

const BAR_COLORS: Record<string, string> = {
  SMALL: "#3b82f6",
  MEDIUM: "#f59e0b",
  LARGE: "#ea580c",
};

export function SubscriptionAnalysisClient() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subscriptions/analysis");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao carregar análise");
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData =
    data?.bySize.map((r) => ({
      name: r.label,
      quantidade: r.productCount,
      size: r.size,
    })) ?? [];

  return (
    <div>
      <PageHeader
        title="Análise — Assinaturas"
        description="Quantidade de produtos ativos com estoque por porte de pet (pequeno, médio e grande). Um produto pode entrar em mais de um porte."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Com estoque</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {loading ? "…" : (data?.totalActiveProducts ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-zinc-500">
            Produtos ativos com saldo &gt; 0
          </CardContent>
        </Card>
        {data?.bySize.map((row) => (
          <Card key={row.size}>
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-2">
                Porte {row.label}
                <Badge variant="muted">{row.shortLabel}</Badge>
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {loading ? "…" : row.productCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-zinc-500">
              Produtos que servem este porte
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && data && data.productsWithoutSize > 0 ? (
        <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">
          {data.productsWithoutSize} produto(s) com estoque sem porte cadastrado.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Produtos por porte</CardTitle>
            <CardDescription>
              Contagem por porte (produto multi-porte conta em cada um)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Carregando...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="quantidade" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.size}
                        fill={BAR_COLORS[entry.size] ?? "#64748b"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
            <CardDescription>Detalhamento numérico</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Porte</TH>
                  <TH className="text-right">Qtd. produtos</TH>
                  <TH className="text-right">% do catálogo*</TH>
                </TR>
              </THead>
              <TBody>
                {loading || !data ? (
                  <TR>
                    <TD colSpan={3} className="py-8 text-center text-zinc-500">
                      Carregando...
                    </TD>
                  </TR>
                ) : (
                  data.bySize.map((row) => {
                    const pct =
                      data.totalActiveProducts > 0
                        ? (row.productCount / data.totalActiveProducts) * 100
                        : 0;
                    return (
                      <TR key={row.size}>
                        <TD>
                          <span className="font-medium">{row.label}</span>{" "}
                          <span className="text-xs text-zinc-500">
                            ({row.shortLabel})
                          </span>
                        </TD>
                        <TD className="text-right tabular-nums font-medium">
                          {row.productCount}
                        </TD>
                        <TD className="text-right tabular-nums text-zinc-600">
                          {pct.toLocaleString("pt-BR", {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
            <p className="mt-3 text-xs text-zinc-500">
              * Percentual sobre produtos ativos com estoque. A soma pode passar
              de 100% porque o mesmo produto pode atender vários portes.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
