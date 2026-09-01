"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/date";
import {
  Plus,
  Eye,
  Download,
  Copy,
  CheckCircle2,
  XCircle,
} from "lucide-react";

type Campaign = {
  id: string;
  name: string;
  channel: string;
  status: string;
  selectedCount: number;
  segmentKey: string | null;
  startsAt: string | null;
  endsAt: string | null;
  coupon: { code: string } | null;
  createdAt: string;
};

type CampaignDetail = Campaign & {
  description: string | null;
  message: string | null;
  customers: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    marketingConsent: boolean;
  }>;
  couponSales: Array<{
    id: string;
    number: number;
    total: number;
    saleDate: string;
    customer: { name: string } | null;
  }>;
  couponSalesTotal: number;
  couponSalesCount: number;
};

type CouponOpt = { id: string; code: string };

const SEGMENTS = [
  { key: "all", label: "Todos os clientes" },
  { key: "recurring", label: "Recorrentes" },
  { key: "once", label: "Compraram só 1x" },
  { key: "inactive_30", label: "Sem compra há 30 dias" },
  { key: "inactive_60", label: "Sem compra há 60 dias" },
  { key: "inactive_90", label: "Sem compra há 90 dias" },
  { key: "top_revenue", label: "Maior faturamento" },
  { key: "birthday_month", label: "Aniversariantes do mês" },
  { key: "pet_birthday_month", label: "Pets aniversariantes" },
  { key: "new", label: "Novos clientes" },
];

const statusVariant: Record<
  string,
  "default" | "success" | "warning" | "danger" | "muted"
> = {
  DRAFT: "muted",
  READY: "default",
  RUNNING: "warning",
  COMPLETED: "success",
  CANCELLED: "danger",
};

export function CampaignsClient() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [coupons, setCoupons] = useState<CouponOpt[]>([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [excluded, setExcluded] = useState(0);

  const [form, setForm] = useState({
    name: "",
    description: "",
    channel: "WHATSAPP",
    segmentKey: "inactive_30",
    message: "",
    couponId: "",
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: "",
  });

  async function load() {
    const res = await fetch("/api/campaigns?pageSize=50");
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    setItems(data.items);
  }

  async function loadCoupons() {
    const res = await fetch("/api/coupons?pageSize=50&active=true");
    const data = await res.json();
    if (res.ok) setCoupons(data.items);
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
      void loadCoupons();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  async function preview() {
    const res = await fetch("/api/campaigns/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: form.channel,
        segmentKey: form.segmentKey,
        segmentFilters: {},
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro no preview");
      return;
    }
    setPreviewCount(data.count);
    setExcluded(data.excludedNoConsent || 0);
  }

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void preview(), 100);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.channel, form.segmentKey]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        channel: form.channel,
        segmentKey: form.segmentKey,
        segmentFilters: {},
        message: form.message || null,
        couponId: form.couponId || null,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        status: "READY",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro ao criar");
      return;
    }
    toast.success(
      `Campanha criada com ${data.selectedCount} contato(s)`,
    );
    setOpen(false);
    await load();
    await openDetail(data.id);
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/campaigns/${id}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    setDetail(data);
  }

  async function statusAction(action: "complete" | "cancel") {
    if (!detail) return;
    if (action === "complete" && !confirm("Marcar campanha como realizada?")) {
      return;
    }
    const res = await fetch(`/api/campaigns/${detail.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    toast.success(`Status: ${data.status}`);
    await openDetail(detail.id);
    await load();
  }

  function copyContacts() {
    if (!detail) return;
    const isEmail = detail.channel === "EMAIL";
    const text = detail.customers
      .map((c) => (isEmail ? c.email : c.whatsapp || c.phone))
      .filter(Boolean)
      .join(isEmail ? "; " : "\n");
    void navigator.clipboard.writeText(text);
    toast.success(`${detail.customers.length} contato(s) copiados`);
  }

  function exportContacts() {
    if (!detail) return;
    window.open(`/api/campaigns/${detail.id}/export`, "_blank");
  }

  return (
    <div>
      <PageHeader
        title="Campanhas"
        description="Segmentos do CRM, listas de contatos e acompanhamento de cupons — sem disparo automático no MVP."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova campanha
          </Button>
        }
      />

      <Table>
        <THead>
          <TR>
            <TH>Nome</TH>
            <TH>Canal</TH>
            <TH>Segmento</TH>
            <TH>Contatos</TH>
            <TH>Cupom</TH>
            <TH>Status</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {!items.length ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-zinc-500">
                Nenhuma campanha
              </TD>
            </TR>
          ) : (
            items.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}</TD>
                <TD>
                  <Badge variant="muted">{c.channel}</Badge>
                </TD>
                <TD className="text-xs">{c.segmentKey || "—"}</TD>
                <TD>{c.selectedCount}</TD>
                <TD className="font-mono text-xs">
                  {c.coupon?.code || "—"}
                </TD>
                <TD>
                  <Badge variant={statusVariant[c.status] || "muted"}>
                    {c.status}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openDetail(c.id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nova campanha"
        description="Sem envio automático — você exporta/copia e dispara manualmente."
        className="sm:max-w-2xl"
      >
        <form onSubmit={create} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Reativação inativos 30 dias"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Canal *</Label>
              <Select
                value={form.channel}
                onChange={(e) =>
                  setForm((f) => ({ ...f, channel: e.target.value }))
                }
              >
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">E-mail</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="OTHER">Outro</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Segmento *</Label>
              <Select
                value={form.segmentKey}
                onChange={(e) =>
                  setForm((f) => ({ ...f, segmentKey: e.target.value }))
                }
              >
                {SEGMENTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {(form.channel === "WHATSAPP" || form.channel === "EMAIL") && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              Contatos sem consentimento de marketing serão excluídos
              automaticamente neste canal.
            </p>
          )}

          <div className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
            Prévia:{" "}
            <strong>
              {previewCount == null ? "…" : previewCount} contato(s)
            </strong>
            {excluded > 0 ? (
              <span className="text-zinc-500">
                {" "}
                · {excluded} excluído(s) sem consentimento
              </span>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Cupom (opcional)</Label>
            <Select
              value={form.couponId}
              onChange={(e) =>
                setForm((f) => ({ ...f, couponId: e.target.value }))
              }
            >
              <option value="">Nenhum</option>
              {coupons.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input
                type="date"
                value={form.startsAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startsAt: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input
                type="date"
                value={form.endsAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endsAt: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mensagem (roteiro)</Label>
            <Textarea
              value={form.message}
              onChange={(e) =>
                setForm((f) => ({ ...f, message: e.target.value }))
              }
              placeholder="Oi {nome}! Sentimos sua falta na Raze Pet..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Descrição interna</Label>
            <Input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Criar campanha</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name || "Campanha"}
        description={
          detail
            ? `${detail.channel} · ${detail.selectedCount} contatos`
            : undefined
        }
        className="sm:max-w-3xl"
      >
        {detail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusVariant[detail.status] || "muted"}>
                {detail.status}
              </Badge>
              {detail.coupon ? (
                <Badge>Cupom {detail.coupon.code}</Badge>
              ) : null}
              <span className="text-sm text-zinc-500">
                Segmento: {detail.segmentKey || "—"}
              </span>
            </div>

            {detail.message ? (
              <div className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
                <p className="mb-1 text-xs font-medium text-zinc-500">
                  Mensagem
                </p>
                <p className="whitespace-pre-wrap">{detail.message}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={copyContacts}>
                <Copy className="h-4 w-4" />
                Copiar contatos
              </Button>
              <Button size="sm" variant="outline" onClick={exportContacts}>
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
              {detail.status !== "COMPLETED" &&
              detail.status !== "CANCELLED" ? (
                <Button size="sm" onClick={() => statusAction("complete")}>
                  <CheckCircle2 className="h-4 w-4" />
                  Marcar como realizada
                </Button>
              ) : null}
              {detail.status !== "CANCELLED" &&
              detail.status !== "COMPLETED" ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => statusAction("cancel")}
                >
                  <XCircle className="h-4 w-4" />
                  Cancelar
                </Button>
              ) : null}
            </div>

            {detail.coupon ? (
              <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <p className="font-medium">Resultado do cupom</p>
                <p className="text-zinc-600 dark:text-zinc-400">
                  {detail.couponSalesCount} venda(s) ·{" "}
                  {formatBRL(detail.couponSalesTotal)}
                </p>
                {detail.couponSales.length ? (
                  <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs">
                    {detail.couponSales.map((s) => (
                      <li key={s.id} className="flex justify-between">
                        <span>
                          PV-{s.number} · {s.customer?.name || "—"} ·{" "}
                          {formatDateBR(s.saleDate)}
                        </span>
                        <span>{formatBRL(s.total)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-sm font-medium">
                Contatos selecionados ({detail.customers.length})
              </p>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <Table>
                  <THead>
                    <TR>
                      <TH>Nome</TH>
                      <TH>WhatsApp/Tel</TH>
                      <TH>E-mail</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {detail.customers.map((c) => (
                      <TR key={c.id}>
                        <TD className="text-sm">{c.name}</TD>
                        <TD className="text-xs">
                          {c.whatsapp || c.phone || "—"}
                        </TD>
                        <TD className="text-xs">{c.email || "—"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
