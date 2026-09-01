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
import { Plus, Pencil, Eye, PawPrint } from "lucide-react";

type Customer = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  origin: string;
  active: boolean;
  marketingConsent: boolean;
  pets: Array<{
    id: string;
    name: string;
    species: string;
    breed?: string | null;
    birthDate?: string | null;
    active?: boolean;
  }>;
  tags: Array<{ id: string; name: string }>;
  _count: { saleOrders: number };
};

type CustomerDetail = Omit<Customer, "pets"> & {
  notes: string | null;
  address: string | null;
  birthDate: string | null;
  stats: {
    firstPurchase: string | null;
    lastPurchase: string | null;
    orderCount: number;
    totalSpent: number;
    ticketAvg: number;
    daysSinceLast: number | null;
    topProducts: Array<{ name: string; qty: number }>;
    topCategories: Array<{ name: string; total: number }>;
    topChannel: string | null;
  };
  saleOrders: Array<{
    id: string;
    number: number;
    saleDate: string;
    total: number;
    channel: string;
    status: string;
  }>;
  pets: Array<{
    id: string;
    name: string;
    species: string;
    breed: string | null;
    birthDate: string | null;
    active: boolean;
  }>;
  possibleDuplicates: Array<{ id: string; name: string }>;
};

const empty = {
  name: "",
  document: "",
  phone: "",
  whatsapp: "",
  email: "",
  birthDate: "",
  address: "",
  city: "",
  state: "SP",
  origin: "STORE",
  notes: "",
  marketingConsent: false,
  active: true,
  tags: "",
};

export function CustomersClient() {
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(empty);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [petForm, setPetForm] = useState({
    name: "",
    species: "DOG",
    breed: "",
    birthDate: "",
  });

  async function load() {
    const p = new URLSearchParams({
      page: "1",
      pageSize: "50",
      search,
      active: "all",
    });
    const res = await fetch(`/api/customers?${p}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    setItems(data.items);
    setTotal(data.total);
  }

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/customers/${id}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    setDetail(data);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      document: c.document || "",
      phone: c.phone || "",
      whatsapp: c.whatsapp || "",
      email: c.email || "",
      birthDate: "",
      address: "",
      city: c.city || "",
      state: c.state || "SP",
      origin: c.origin,
      notes: "",
      marketingConsent: c.marketingConsent,
      active: c.active,
      tags: c.tags.map((t) => t.name).join(", "),
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      email: form.email || null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      force: true,
    };
    const res = await fetch(
      editing ? `/api/customers/${editing.id}` : "/api/customers",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro ao salvar");
      return;
    }
    if (data.needsConfirmation) {
      toast.message(
        `Possíveis duplicados: ${data.duplicates.map((d: { name: string }) => d.name).join(", ")}`,
      );
      return;
    }
    toast.success(editing ? "Cliente atualizado" : "Cliente criado");
    setOpen(false);
    await load();
  }

  async function addPet(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    const res = await fetch(`/api/customers/${detail.id}/pets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: petForm.name,
        species: petForm.species,
        breed: petForm.breed || null,
        birthDate: petForm.birthDate || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    toast.success("Pet cadastrado");
    setPetForm({ name: "", species: "DOG", breed: "", birthDate: "" });
    await openDetail(detail.id);
  }

  return (
    <div>
      <PageHeader
        title="Clientes e pets"
        description="Cadastro comercial simplificado. Venda sem cliente é permitida no PDV."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo cliente
          </Button>
        }
      />

      <div className="mb-4">
        <Input
          placeholder="Buscar nome, documento, telefone ou e-mail"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="mt-2 text-xs text-zinc-500">{total} cliente(s)</p>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Nome</TH>
            <TH>Contato</TH>
            <TH>Origem</TH>
            <TH>Pets</TH>
            <TH>Status</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {!items.length ? (
            <TR>
              <TD colSpan={6} className="py-8 text-center text-zinc-500">
                Nenhum cliente
              </TD>
            </TR>
          ) : (
            items.map((c) => (
              <TR key={c.id}>
                <TD>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-zinc-500">
                    {c.document || "—"}
                  </div>
                </TD>
                <TD className="text-sm">
                  {c.whatsapp || c.phone || c.email || "—"}
                </TD>
                <TD>
                  <Badge variant="muted">{c.origin}</Badge>
                </TD>
                <TD className="text-xs">
                  {c.pets.map((p) => p.name).join(", ") || "—"}
                </TD>
                <TD>
                  <Badge variant={c.active ? "success" : "muted"}>
                    {c.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openDetail(c.id)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
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
        title={editing ? "Editar cliente" : "Novo cliente"}
        className="sm:max-w-2xl"
      >
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Nome *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>CPF/CNPJ</Label>
            <Input
              value={form.document}
              onChange={(e) =>
                setForm((f) => ({ ...f, document: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Origem</Label>
            <Select
              value={form.origin}
              onChange={(e) =>
                setForm((f) => ({ ...f, origin: e.target.value }))
              }
            >
              <option value="STORE">Loja física</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="SITE">Site</option>
              <option value="REFERRAL">Indicação</option>
              <option value="CAMPAIGN">Campanha</option>
              <option value="OTHER">Outro</option>
            </Select>
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
            <Label>Cidade</Label>
            <Input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Tags (separadas por vírgula)</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="vip, recorrente"
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
              checked={form.marketingConsent}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  marketingConsent: e.target.checked,
                }))
              }
            />
            Autoriza comunicações de marketing
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
        title={detail?.name || "Cliente"}
        description="Perfil comercial"
        className="sm:max-w-3xl"
      >
        {detail ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-zinc-500">
                    Total comprado
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-lg font-semibold">
                  {formatBRL(detail.stats.totalSpent)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-zinc-500">
                    Pedidos / ticket
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-lg font-semibold">
                  {detail.stats.orderCount} · {formatBRL(detail.stats.ticketAvg)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-zinc-500">
                    Dias sem compra
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-lg font-semibold">
                  {detail.stats.daysSinceLast ?? "—"}
                </CardContent>
              </Card>
            </div>

            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              <p>
                Contato: {detail.whatsapp || detail.phone || "—"} ·{" "}
                {detail.email || "—"}
              </p>
              <p>
                1ª compra: {formatDateBR(detail.stats.firstPurchase)} · Última:{" "}
                {formatDateBR(detail.stats.lastPurchase)}
              </p>
              <p>
                Canal preferido: {detail.stats.topChannel || "—"} · Marketing:{" "}
                {detail.marketingConsent ? "sim" : "não"}
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <PawPrint className="h-4 w-4 text-orange-600" />
                <p className="text-sm font-medium">Pets</p>
              </div>
              <ul className="mb-3 space-y-1 text-sm">
                {detail.pets
                  .filter((p) => p.active)
                  .map((p) => (
                    <li key={p.id}>
                      {p.name} · {p.species}
                      {p.breed ? ` · ${p.breed}` : ""}
                    </li>
                  ))}
                {!detail.pets.filter((p) => p.active).length ? (
                  <li className="text-zinc-500">Nenhum pet</li>
                ) : null}
              </ul>
              <form onSubmit={addPet} className="grid gap-2 sm:grid-cols-4">
                <Input
                  placeholder="Nome do pet"
                  required
                  value={petForm.name}
                  onChange={(e) =>
                    setPetForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
                <Select
                  value={petForm.species}
                  onChange={(e) =>
                    setPetForm((f) => ({ ...f, species: e.target.value }))
                  }
                >
                  <option value="DOG">Cão</option>
                  <option value="CAT">Gato</option>
                  <option value="BIRD">Ave</option>
                  <option value="OTHER">Outro</option>
                </Select>
                <Input
                  placeholder="Raça"
                  value={petForm.breed}
                  onChange={(e) =>
                    setPetForm((f) => ({ ...f, breed: e.target.value }))
                  }
                />
                <Button type="submit" size="sm">
                  + Pet
                </Button>
              </form>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium">Últimas vendas</p>
              {!detail.saleOrders.length ? (
                <p className="text-sm text-zinc-500">Nenhuma venda</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {detail.saleOrders.map((o) => (
                    <li
                      key={o.id}
                      className="flex justify-between rounded border border-zinc-100 px-2 py-1 dark:border-zinc-800"
                    >
                      <span>
                        PV-{o.number} · {o.channel}
                      </span>
                      <span>{formatBRL(o.total)}</span>
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
