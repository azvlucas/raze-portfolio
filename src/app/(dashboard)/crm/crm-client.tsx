"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/date";
import { Download, RefreshCw } from "lucide-react";

type Overview = {
  totalCustomers: number;
  withPurchases: number;
  oneShot: number;
  recurring: number;
  inactive30: number;
  inactive60: number;
  inactive90: number;
  totalRevenue: number;
  avgTicket: number;
  marketingConsent: number;
  birthdayThisMonth: number;
  petBirthdayThisMonth: number;
  topCustomers: Array<{
    customerId: string;
    name: string;
    totalSpent: number;
    orderCount: number;
  }>;
};

type SegmentItem = {
  customerId: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
  city: string | null;
  origin: string;
  orderCount: number;
  totalSpent: number;
  ticketAvg: number;
  daysSinceLast: number | null;
  lastPurchase: string | null;
  marketingConsent: boolean;
  tags: string[];
};

const QUICK = [
  { key: "all", label: "Todos" },
  { key: "new", label: "Novos (30d)" },
  { key: "recurring", label: "Recorrentes" },
  { key: "once", label: "Compraram 1x" },
  { key: "inactive_30", label: "Sem compra 30d" },
  { key: "inactive_60", label: "Sem compra 60d" },
  { key: "inactive_90", label: "Sem compra 90d" },
  { key: "top_revenue", label: "Maior faturamento" },
  { key: "top_frequency", label: "Maior frequência" },
  { key: "birthday_month", label: "Aniversariantes" },
  { key: "pet_birthday_month", label: "Pets aniversariantes" },
];

export function CrmClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [quick, setQuick] = useState("all");
  const [items, setItems] = useState<SegmentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{
    totalCustomers: number;
    withPurchases: number;
    totalRevenue: number;
    avgTicket: number;
    inactive30: number;
    marketingOk: number;
  } | null>(null);
  const [city, setCity] = useState("");
  const [origin, setOrigin] = useState("all");
  const [consentOnly, setConsentOnly] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadOverview() {
    const res = await fetch("/api/crm/overview");
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro no overview");
      return;
    }
    setOverview(data);
  }

  async function loadSegment() {
    setLoading(true);
    try {
      const p = new URLSearchParams({
        quick,
        page: "1",
        pageSize: "50",
        sortBy: quick === "top_frequency" ? "orderCount" : "totalSpent",
        sortDir: "desc",
      });
      if (city) p.set("city", city);
      if (origin !== "all") p.set("origin", origin);
      if (consentOnly) p.set("marketingConsentOnly", "true");

      const res = await fetch(`/api/crm/segments?${p}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao segmentar");
      setItems(data.items);
      setTotal(data.total);
      setSummary(data.summary);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadOverview();
      void loadSegment();
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void loadSegment(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick, city, origin, consentOnly]);

  function exportCsv() {
    const p = new URLSearchParams({
      quick,
      export: "csv",
      pageSize: "10000",
    });
    if (city) p.set("city", city);
    if (origin !== "all") p.set("origin", origin);
    if (consentOnly) p.set("marketingConsentOnly", "true");
    window.open(`/api/crm/segments?${p}`, "_blank");
  }

  return (
    <div>
      <PageHeader
        title="CRM"
        description="Comportamento de compra, recorrência e segmentação para campanhas."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void loadOverview();
                void loadSegment();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </>
        }
      />

      {overview ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Clientes ativos", value: overview.totalCustomers },
            { label: "Com compras", value: overview.withPurchases },
            {
              label: "Receita (base)",
              value: formatBRL(overview.totalRevenue),
            },
            { label: "Ticket médio", value: formatBRL(overview.avgTicket) },
            { label: "Recorrentes", value: overview.recurring },
            { label: "Compraram 1x", value: overview.oneShot },
            { label: "Inativos 30/60/90", value: `${overview.inactive30} / ${overview.inactive60} / ${overview.inactive90}` },
            {
              label: "Anivers. / pets mês",
              value: `${overview.birthdayThisMonth} / ${overview.petBirthdayThisMonth}`,
            },
          ].map((c) => (
            <Card key={c.label}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-zinc-500">
                  {c.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">{c.value}</CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <Button
            key={q.key}
            size="sm"
            variant={quick === q.key ? "default" : "outline"}
            onClick={() => setQuick(q.key)}
          >
            {q.label}
          </Button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-4">
        <div>
          <Label className="mb-1.5 block">Cidade</Label>
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Filtrar cidade"
          />
        </div>
        <div>
          <Label className="mb-1.5 block">Origem</Label>
          <Select value={origin} onChange={(e) => setOrigin(e.target.value)}>
            <option value="all">Todas</option>
            <option value="STORE">Loja física</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="SITE">Site</option>
            <option value="REFERRAL">Indicação</option>
            <option value="CAMPAIGN">Campanha</option>
            <option value="OTHER">Outro</option>
          </Select>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consentOnly}
              onChange={(e) => setConsentOnly(e.target.checked)}
            />
            Só com consentimento
          </label>
        </div>
        <div className="flex items-end pb-2 text-sm text-zinc-500">
          {summary
            ? `${total} no segmento · mkt ${summary.marketingOk}`
            : loading
              ? "Carregando..."
              : ""}
        </div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Cliente</TH>
            <TH>Contato</TH>
            <TH>Compras</TH>
            <TH>Total</TH>
            <TH>Ticket</TH>
            <TH>Última</TH>
            <TH>Dias</TH>
            <TH>Mkt</TH>
          </TR>
        </THead>
        <TBody>
          {loading ? (
            <TR>
              <TD colSpan={8} className="py-8 text-center text-zinc-500">
                Calculando segmentos...
              </TD>
            </TR>
          ) : !items.length ? (
            <TR>
              <TD colSpan={8} className="py-8 text-center text-zinc-500">
                Nenhum cliente neste segmento
              </TD>
            </TR>
          ) : (
            items.map((m) => (
              <TR key={m.customerId}>
                <TD>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-zinc-500">
                    {m.city || "—"} · {m.origin}
                    {m.tags.length
                      ? ` · ${m.tags.slice(0, 2).join(", ")}`
                      : ""}
                  </div>
                </TD>
                <TD className="text-sm">
                  {m.whatsapp || m.phone || m.email || "—"}
                </TD>
                <TD>{m.orderCount}</TD>
                <TD>{formatBRL(m.totalSpent)}</TD>
                <TD>{formatBRL(m.ticketAvg)}</TD>
                <TD className="text-xs">{formatDateBR(m.lastPurchase)}</TD>
                <TD>
                  {m.daysSinceLast != null ? (
                    <Badge
                      variant={
                        m.daysSinceLast >= 90
                          ? "danger"
                          : m.daysSinceLast >= 30
                            ? "warning"
                            : "success"
                      }
                    >
                      {m.daysSinceLast}d
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>
                  <Badge variant={m.marketingConsent ? "success" : "muted"}>
                    {m.marketingConsent ? "sim" : "não"}
                  </Badge>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      {overview?.topCustomers?.length ? (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Top faturamento</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {overview.topCustomers.slice(0, 6).map((c, i) => (
              <div
                key={c.customerId}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span>
                  <span className="mr-2 text-zinc-400">#{i + 1}</span>
                  {c.name}
                  <span className="ml-2 text-xs text-zinc-500">
                    {c.orderCount} pedidos
                  </span>
                </span>
                <span className="font-medium">{formatBRL(c.totalSpent)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
