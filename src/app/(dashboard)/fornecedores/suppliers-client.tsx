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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/date";
import { Plus, Pencil, Ban, Eye } from "lucide-react";

type Supplier = {
  id: string;
  legalName: string;
  tradeName: string | null;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  mainContact: string | null;
  avgDeliveryDays: number | null;
  paymentTerms: string | null;
  notes: string | null;
  address: string | null;
  stateRegistration: string | null;
  active: boolean;
};

type SupplierDetail = Supplier & {
  stats: {
    totalPurchased: number;
    orderCount: number;
    lastPurchaseDate: string | null;
    pendingOrders: number;
    productsSupplied: number;
  };
  recentOrders: Array<{
    id: string;
    number: number;
    status: string;
    issueDate: string;
    grandTotal: number;
  }>;
};

const empty = {
  legalName: "",
  tradeName: "",
  document: "",
  stateRegistration: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  city: "",
  state: "SP",
  mainContact: "",
  avgDeliveryDays: "",
  paymentTerms: "",
  notes: "",
  active: true,
};

export function SuppliersClient() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(empty);
  const [detail, setDetail] = useState<SupplierDetail | null>(null);

  async function load() {
    const p = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      search,
      active,
    });
    const res = await fetch(`/api/suppliers?${p}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro ao listar");
      return;
    }
    setItems(data.items);
    setTotal(data.total);
  }

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, active]);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      legalName: s.legalName,
      tradeName: s.tradeName || "",
      document: s.document || "",
      stateRegistration: s.stateRegistration || "",
      phone: s.phone || "",
      whatsapp: s.whatsapp || "",
      email: s.email || "",
      address: s.address || "",
      city: s.city || "",
      state: s.state || "SP",
      mainContact: s.mainContact || "",
      avgDeliveryDays:
        s.avgDeliveryDays != null ? String(s.avgDeliveryDays) : "",
      paymentTerms: s.paymentTerms || "",
      notes: s.notes || "",
      active: s.active,
    });
    setOpen(true);
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/suppliers/${id}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    setDetail(data);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      avgDeliveryDays: form.avgDeliveryDays
        ? Number(form.avgDeliveryDays)
        : null,
      email: form.email || null,
    };
    const res = await fetch(
      editing ? `/api/suppliers/${editing.id}` : "/api/suppliers",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Falha ao salvar");
      return;
    }
    toast.success(editing ? "Fornecedor atualizado" : "Fornecedor criado");
    setOpen(false);
    await load();
  }

  async function deactivate(s: Supplier) {
    if (!confirm(`Inativar ${s.legalName}?`)) return;
    const res = await fetch(`/api/suppliers/${s.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    toast.success("Fornecedor inativado");
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        description="Cadastro e histórico de compras por fornecedor."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo fornecedor
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Input
            placeholder="Buscar por nome, documento ou e-mail"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={active}
          onChange={(e) => {
            setActive(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Todos</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </Select>
      </div>

      <p className="mb-2 text-xs text-zinc-500">{total} fornecedor(es)</p>

      <Table>
        <THead>
          <TR>
            <TH>Nome</TH>
            <TH>Documento</TH>
            <TH>Contato</TH>
            <TH>Cidade</TH>
            <TH>Status</TH>
            <TH className="text-right">Ações</TH>
          </TR>
        </THead>
        <TBody>
          {!items.length ? (
            <TR>
              <TD colSpan={6} className="py-8 text-center text-zinc-500">
                Nenhum fornecedor
              </TD>
            </TR>
          ) : (
            items.map((s) => (
              <TR key={s.id} className={!s.active ? "opacity-60" : undefined}>
                <TD>
                  <div className="font-medium">{s.legalName}</div>
                  {s.tradeName ? (
                    <div className="text-xs text-zinc-500">{s.tradeName}</div>
                  ) : null}
                </TD>
                <TD className="font-mono text-xs">{s.document || "—"}</TD>
                <TD className="text-sm">
                  {s.whatsapp || s.phone || s.email || "—"}
                </TD>
                <TD>
                  {s.city || "—"}
                  {s.state ? `/${s.state}` : ""}
                </TD>
                <TD>
                  <Badge variant={s.active ? "success" : "muted"}>
                    {s.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openDetail(s.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {s.active ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deactivate(s)}
                      >
                        <Ban className="h-4 w-4 text-red-500" />
                      </Button>
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar fornecedor" : "Novo fornecedor"}
        className="sm:max-w-2xl"
      >
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Razão social / Nome *</Label>
            <Input
              required
              value={form.legalName}
              onChange={(e) =>
                setForm((f) => ({ ...f, legalName: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Nome fantasia</Label>
            <Input
              value={form.tradeName}
              onChange={(e) =>
                setForm((f) => ({ ...f, tradeName: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>CNPJ/CPF</Label>
            <Input
              value={form.document}
              onChange={(e) =>
                setForm((f) => ({ ...f, document: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp</Label>
            <Input
              value={form.whatsapp}
              onChange={(e) =>
                setForm((f) => ({ ...f, whatsapp: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Contato principal</Label>
            <Input
              value={form.mainContact}
              onChange={(e) =>
                setForm((f) => ({ ...f, mainContact: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>UF</Label>
            <Input
              maxLength={2}
              value={form.state}
              onChange={(e) =>
                setForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Prazo médio (dias)</Label>
            <Input
              type="number"
              min="0"
              value={form.avgDeliveryDays}
              onChange={(e) =>
                setForm((f) => ({ ...f, avgDeliveryDays: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Condição de pagamento</Label>
            <Input
              value={form.paymentTerms}
              onChange={(e) =>
                setForm((f) => ({ ...f, paymentTerms: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Endereço</Label>
            <Input
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({ ...f, address: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm((f) => ({ ...f, active: e.target.checked }))
              }
            />
            Ativo
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.legalName || "Fornecedor"}
        description="Perfil e histórico de compras"
        className="sm:max-w-2xl"
      >
        {detail ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-500">
                    Total comprado
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xl font-semibold">
                  {formatBRL(detail.stats.totalPurchased)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-500">
                    Pedidos / pendentes
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xl font-semibold">
                  {detail.stats.orderCount} / {detail.stats.pendingOrders}
                </CardContent>
              </Card>
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              <p>
                Contato: {detail.mainContact || "—"} ·{" "}
                {detail.whatsapp || detail.phone || "—"}
              </p>
              <p>
                Última compra:{" "}
                {formatDateBR(detail.stats.lastPurchaseDate)} · Produtos
                fornecidos: {detail.stats.productsSupplied}
              </p>
              <p>Pagamento padrão: {detail.paymentTerms || "—"}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Pedidos recentes</p>
              {!detail.recentOrders.length ? (
                <p className="text-sm text-zinc-500">Nenhum pedido</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {detail.recentOrders.map((o) => (
                    <li
                      key={o.id}
                      className="flex justify-between rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800"
                    >
                      <span>
                        PC-{o.number} · {o.status}
                      </span>
                      <span>{formatBRL(o.grandTotal)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
