"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/date";
import { Plus } from "lucide-react";

type Coupon = {
  id: string;
  code: string;
  description: string | null;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  minOrderValue: number;
  startsAt: string;
  endsAt: string | null;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  active: boolean;
  usageCount: number;
  channels: string[];
};

export function CouponsClient() {
  const [items, setItems] = useState<Coupon[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    description: "",
    discountType: "PERCENT",
    discountValue: "10",
    minOrderValue: "0",
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: "",
    maxUses: "",
    maxUsesPerCustomer: "1",
    active: true,
  });

  async function load() {
    const res = await fetch("/api/coupons?pageSize=50");
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    setItems(data.items);
  }

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      code: form.code,
      description: form.description || null,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minOrderValue: Number(form.minOrderValue) || 0,
      startsAt: form.startsAt,
      endsAt: form.endsAt || null,
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      maxUsesPerCustomer: form.maxUsesPerCustomer
        ? Number(form.maxUsesPerCustomer)
        : null,
      active: form.active,
      channels: [],
      productIds: [],
      categoryIds: [],
    };
    const res = await fetch("/api/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    toast.success("Cupom criado");
    setOpen(false);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Cupons"
        description="Descontos percentuais ou fixos com limites de uso."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo cupom
          </Button>
        }
      />

      <Table>
        <THead>
          <TR>
            <TH>Código</TH>
            <TH>Tipo</TH>
            <TH>Valor</TH>
            <TH>Mínimo</TH>
            <TH>Vigência</TH>
            <TH>Usos</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {!items.length ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-zinc-500">
                Nenhum cupom
              </TD>
            </TR>
          ) : (
            items.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono font-medium">{c.code}</TD>
                <TD>{c.discountType === "PERCENT" ? "%" : "R$ fixo"}</TD>
                <TD>
                  {c.discountType === "PERCENT"
                    ? `${c.discountValue}%`
                    : formatBRL(c.discountValue)}
                </TD>
                <TD>{formatBRL(c.minOrderValue)}</TD>
                <TD className="text-xs">
                  {formatDateBR(c.startsAt)}
                  {c.endsAt ? ` → ${formatDateBR(c.endsAt)}` : ""}
                </TD>
                <TD>
                  {c.usageCount}
                  {c.maxUses != null ? ` / ${c.maxUses}` : ""}
                </TD>
                <TD>
                  <Badge variant={c.active ? "success" : "muted"}>
                    {c.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      <Dialog open={open} onClose={() => setOpen(false)} title="Novo cupom">
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Código *</Label>
            <Input
              required
              value={form.code}
              onChange={(e) =>
                setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
              }
              placeholder="RAZE10"
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select
              value={form.discountType}
              onChange={(e) =>
                setForm((f) => ({ ...f, discountType: e.target.value }))
              }
            >
              <option value="PERCENT">Percentual</option>
              <option value="FIXED">Valor fixo</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Valor *</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.discountValue}
              onChange={(e) =>
                setForm((f) => ({ ...f, discountValue: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Pedido mínimo</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.minOrderValue}
              onChange={(e) =>
                setForm((f) => ({ ...f, minOrderValue: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Início *</Label>
            <Input
              type="date"
              required
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
          <div className="space-y-2">
            <Label>Limite total de usos</Label>
            <Input
              type="number"
              min="1"
              value={form.maxUses}
              onChange={(e) =>
                setForm((f) => ({ ...f, maxUses: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Limite por cliente</Label>
            <Input
              type="number"
              min="1"
              value={form.maxUsesPerCustomer}
              onChange={(e) =>
                setForm((f) => ({ ...f, maxUsesPerCustomer: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Descrição</Label>
            <Input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
