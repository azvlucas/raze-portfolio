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
import { formatBRL, formatPercent } from "@/lib/money";
import { Plus, Pencil, Trash2 } from "lucide-react";

type SaleCost = {
  id: string;
  name: string;
  description: string | null;
  type: "FIXED" | "PERCENT";
  value: number;
  active: boolean;
  sortOrder: number;
};

const empty = {
  name: "",
  description: "",
  type: "FIXED" as "FIXED" | "PERCENT",
  value: "0",
  active: true,
  sortOrder: "0",
};

export function SaleCostsClient() {
  const [items, setItems] = useState<SaleCost[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SaleCost | null>(null);
  const [form, setForm] = useState(empty);

  async function load() {
    const res = await fetch("/api/sale-costs");
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro ao carregar custos");
      return;
    }
    setItems(data);
  }

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function openEdit(item: SaleCost) {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description || "",
      type: item.type,
      value: String(item.value),
      active: item.active,
      sortOrder: String(item.sortOrder),
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      description: form.description || null,
      type: form.type,
      value: Number(form.value),
      active: form.active,
      sortOrder: Number(form.sortOrder) || 0,
    };
    const res = await fetch(
      editing ? `/api/sale-costs/${editing.id}` : "/api/sale-costs",
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
    toast.success(editing ? "Custo atualizado" : "Custo criado");
    setOpen(false);
    await load();
  }

  async function remove(item: SaleCost) {
    if (!confirm(`Excluir o custo "${item.name}"?`)) return;
    const res = await fetch(`/api/sale-costs/${item.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro ao excluir");
      return;
    }
    toast.success("Custo removido");
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Custos de venda"
        description="Custos comuns a todas as vendas (ex.: embalagem, taxa média). São somados ao custo dos produtos nos dashboards de lucro."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo custo
          </Button>
        }
      />

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">Como entra no dashboard</p>
        <p className="mt-1 text-xs opacity-90">
          Para cada venda finalizada:{" "}
          <strong>custo total = custo dos produtos + custos de venda</strong>.
          Custo fixo (R$) é adicionado por venda; percentual (%) incide sobre o
          total da venda.
        </p>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Nome</TH>
            <TH>Tipo</TH>
            <TH>Valor</TH>
            <TH>Ordem</TH>
            <TH>Status</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {!items.length ? (
            <TR>
              <TD colSpan={6} className="py-8 text-center text-zinc-500">
                Nenhum custo cadastrado
              </TD>
            </TR>
          ) : (
            items.map((c) => (
              <TR key={c.id} className={!c.active ? "opacity-60" : undefined}>
                <TD>
                  <div className="font-medium">{c.name}</div>
                  {c.description ? (
                    <div className="text-xs text-zinc-500">{c.description}</div>
                  ) : null}
                </TD>
                <TD>
                  <Badge variant="muted">
                    {c.type === "FIXED" ? "Fixo (R$)" : "Percentual (%)"}
                  </Badge>
                </TD>
                <TD>
                  {c.type === "FIXED"
                    ? formatBRL(c.value)
                    : formatPercent(c.value)}
                </TD>
                <TD>{c.sortOrder}</TD>
                <TD>
                  <Badge variant={c.active ? "success" : "muted"}>
                    {c.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(c)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(c)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
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
        title={editing ? "Editar custo de venda" : "Novo custo de venda"}
      >
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Ex.: Embalagem, Taxa média de cartão"
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  type: e.target.value as "FIXED" | "PERCENT",
                }))
              }
            >
              <option value="FIXED">Valor fixo por venda (R$)</option>
              <option value="PERCENT">Percentual sobre o total (%)</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              Valor * {form.type === "FIXED" ? "(R$)" : "(%)"}
            </Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.value}
              onChange={(e) =>
                setForm((f) => ({ ...f, value: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Ordem de exibição</Label>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) =>
                setForm((f) => ({ ...f, sortOrder: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm((f) => ({ ...f, active: e.target.checked }))
              }
            />
            Ativo (entra no cálculo do dashboard)
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
