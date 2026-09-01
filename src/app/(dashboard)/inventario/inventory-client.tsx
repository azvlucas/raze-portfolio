"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDateTimeBR } from "@/lib/date";
import { Plus, Save, Check } from "lucide-react";

type InvListItem = {
  id: string;
  code: string;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
  user: { name: string };
  _count: { items: number };
};

type InvDetail = {
  id: string;
  code: string;
  status: string;
  items: Array<{
    id: string;
    productId: string;
    batchId: string | null;
    systemQty: number;
    countedQty: number;
    differenceQty: number;
    product: { name: string; internalCode: string };
  }>;
};

export function InventoryClient() {
  const [list, setList] = useState<InvListItem[]>([]);
  const [current, setCurrent] = useState<InvDetail | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});

  async function loadList() {
    const res = await fetch("/api/inventory");
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    setList(data);
  }

  async function openInv(id: string) {
    const res = await fetch(`/api/inventory/${id}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    setCurrent(data);
    const map: Record<string, string> = {};
    for (const item of data.items) {
      map[item.id] = String(item.countedQty);
    }
    setCounts(map);
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadList();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  async function createInv() {
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Inventário iniciado" }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro ao criar");
      return;
    }
    toast.success(`Inventário ${data.code} criado`);
    await loadList();
    await openInv(data.id);
  }

  async function saveCounts() {
    if (!current) return;
    const items = current.items.map((item) => ({
      productId: item.productId,
      batchId: item.batchId,
      countedQty: Number(counts[item.id] ?? item.countedQty),
    }));
    const res = await fetch(`/api/inventory/${current.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro ao salvar");
      return;
    }
    toast.success("Contagens salvas");
    setCurrent(data);
  }

  async function confirmInventoryAction() {
    if (!current) return;
    if (
      !window.confirm(
        "Confirmar inventário? As divergências gerarão ajustes de estoque.",
      )
    ) {
      return;
    }
    await saveCounts();
    const res = await fetch(`/api/inventory/${current.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm" }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro ao confirmar");
      return;
    }
    toast.success("Inventário confirmado");
    setCurrent(null);
    await loadList();
  }

  const editable =
    current &&
    (current.status === "IN_PROGRESS" || current.status === "DRAFT");

  return (
    <div>
      <PageHeader
        title="Inventário"
        description="Conte o estoque físico, compare com o sistema e confirme os ajustes."
        actions={
          <Button size="sm" onClick={createInv}>
            <Plus className="h-4 w-4" />
            Novo inventário
          </Button>
        }
      />

      {!current ? (
        <Table>
          <THead>
            <TR>
              <TH>Código</TH>
              <TH>Status</TH>
              <TH>Itens</TH>
              <TH>Responsável</TH>
              <TH>Criado em</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {!list.length ? (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-zinc-500">
                  Nenhum inventário
                </TD>
              </TR>
            ) : (
              list.map((inv) => (
                <TR key={inv.id}>
                  <TD className="font-mono text-xs">{inv.code}</TD>
                  <TD>
                    <Badge
                      variant={
                        inv.status === "CONFIRMED"
                          ? "success"
                          : inv.status === "CANCELLED"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {inv.status}
                    </Badge>
                  </TD>
                  <TD>{inv._count.items}</TD>
                  <TD>{inv.user.name}</TD>
                  <TD className="text-xs">{formatDateTimeBR(inv.createdAt)}</TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openInv(inv.id)}
                    >
                      Abrir
                    </Button>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{current.code}</h2>
              <Badge variant="muted">{current.status}</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrent(null)}>
                Voltar
              </Button>
              {editable ? (
                <>
                  <Button size="sm" variant="secondary" onClick={saveCounts}>
                    <Save className="h-4 w-4" />
                    Salvar contagens
                  </Button>
                  <Button size="sm" onClick={confirmInventoryAction}>
                    <Check className="h-4 w-4" />
                    Confirmar ajustes
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <Table>
            <THead>
              <TR>
                <TH>Produto</TH>
                <TH>Sistema</TH>
                <TH>Contado</TH>
                <TH>Diferença</TH>
              </TR>
            </THead>
            <TBody>
              {current.items.map((item) => {
                const counted = Number(counts[item.id] ?? item.countedQty);
                const diff = counted - item.systemQty;
                return (
                  <TR key={item.id}>
                    <TD>
                      <div className="font-medium">{item.product.name}</div>
                      <div className="text-xs text-zinc-500">
                        {item.product.internalCode}
                        {item.batchId ? ` · lote` : ""}
                      </div>
                    </TD>
                    <TD>{item.systemQty}</TD>
                    <TD>
                      {editable ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.0001"
                          className="w-28"
                          value={counts[item.id] ?? ""}
                          onChange={(e) =>
                            setCounts((c) => ({
                              ...c,
                              [item.id]: e.target.value,
                            }))
                          }
                        />
                      ) : (
                        item.countedQty
                      )}
                    </TD>
                    <TD
                      className={
                        diff === 0
                          ? "text-zinc-500"
                          : diff > 0
                            ? "text-emerald-600"
                            : "text-red-600"
                      }
                    >
                      {diff > 0 ? "+" : ""}
                      {diff}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
