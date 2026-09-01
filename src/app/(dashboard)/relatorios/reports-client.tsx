"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Download, FileText } from "lucide-react";

const REPORTS = [
  { type: "stock_current", label: "Estoque atual" },
  { type: "stock_low", label: "Estoque abaixo do mínimo" },
  { type: "stock_out", label: "Produtos sem estoque" },
  { type: "stock_movements", label: "Movimentações de estoque" },
  { type: "expiring", label: "Próximos do vencimento" },
  { type: "expired", label: "Produtos vencidos" },
  { type: "purchases_period", label: "Compras por período" },
  { type: "sales_period", label: "Vendas por período" },
  { type: "sales_by_product", label: "Vendas por produto" },
  { type: "sales_by_category", label: "Vendas por categoria" },
  { type: "sales_by_customer", label: "Vendas por cliente" },
  { type: "sales_by_seller", label: "Vendas por vendedor" },
  { type: "sales_by_channel", label: "Vendas por canal" },
  { type: "margin_by_product", label: "Margem por produto" },
  { type: "customers_inactive", label: "Clientes inativos" },
  { type: "birthdays", label: "Aniversariantes do mês" },
  { type: "coupon_usage", label: "Uso de cupons" },
  { type: "campaigns", label: "Campanhas" },
];

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function ReportsClient() {
  const range = defaultRange();
  const [type, setType] = useState("sales_period");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [daysInactive, setDaysInactive] = useState("30");
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams({
        type,
        from,
        to,
        format: "json",
        daysInactive,
        daysToExpiry: "30",
      });
      const res = await fetch(`/api/reports?${p}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro no relatório");
      setTitle(data.title);
      setRows(data.rows || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const p = new URLSearchParams({
      type,
      from,
      to,
      format: "csv",
      daysInactive,
      daysToExpiry: "30",
    });
    window.open(`/api/reports?${p}`, "_blank");
  }

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns =
    rows.length > 0 ? Object.keys(rows[0]).slice(0, 8) : [];

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Estoque, vendas, compras, clientes e campanhas — visualização e exportação CSV."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Parâmetros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label>Relatório</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {REPORTS.map((r) => (
                <option key={r.type} value={r.type}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>De</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Até</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          {type === "customers_inactive" ? (
            <div className="space-y-2">
              <Label>Dias sem compra</Label>
              <Select
                value={daysInactive}
                onChange={(e) => setDaysInactive(e.target.value)}
              >
                <option value="30">30</option>
                <option value="60">60</option>
                <option value="90">90</option>
              </Select>
            </div>
          ) : null}
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button onClick={() => void load()} disabled={loading}>
              <FileText className="h-4 w-4" />
              {loading ? "Gerando…" : "Gerar"}
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {title ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">
            {title}{" "}
            <span className="text-sm font-normal text-zinc-500">
              ({rows.length} linha(s))
            </span>
          </h2>
          <Table>
            <THead>
              <TR>
                {columns.map((col) => (
                  <TH key={col}>{col}</TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {!rows.length ? (
                <TR>
                  <TD
                    colSpan={Math.max(columns.length, 1)}
                    className="py-8 text-center text-zinc-500"
                  >
                    Sem registros
                  </TD>
                </TR>
              ) : (
                rows.slice(0, 200).map((row, idx) => (
                  <TR key={idx}>
                    {columns.map((col) => (
                      <TD key={col} className="max-w-[200px] truncate text-sm">
                        {row[col] == null ? "—" : String(row[col])}
                      </TD>
                    ))}
                  </TR>
                ))
              )}
            </TBody>
          </Table>
          {rows.length > 200 ? (
            <p className="mt-2 text-xs text-zinc-500">
              Exibindo 200 de {rows.length}. Use CSV para a lista completa.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
