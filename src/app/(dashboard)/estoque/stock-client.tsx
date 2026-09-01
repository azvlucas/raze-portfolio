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
import { formatDateTimeBR } from "@/lib/date";
import { PackageOpen, Plus, RefreshCw, Trash2 } from "lucide-react";

type ProductOpt = {
  id: string;
  name: string;
  internalCode: string;
  currentStock: number;
};

type Movement = {
  id: string;
  type: string;
  qtyBefore: number;
  qtyDelta: number;
  qtyAfter: number;
  reason: string | null;
  createdAt: string;
  product: { name: string; internalCode: string };
  batch: { code: string } | null;
  user: { name: string } | null;
};

type SupplierOpt = {
  id: string;
  legalName: string;
  tradeName: string | null;
};

type SupplierProductRow = {
  id: string;
  internalCode: string;
  name: string;
  currentStock: number;
  unit?: { code: string } | null;
  type: string;
  quantity: string;
};

const TYPE_LABEL: Record<string, string> = {
  ADJUST_IN: "Entrada",
  ADJUST_OUT: "Saída",
  LOSS: "Perda",
  DAMAGE: "Avaria",
  EXPIRY: "Baixa",
  PURCHASE_IN: "Compra",
  SALE_OUT: "Venda",
  INVENTORY_ADJUST: "Inventário",
};

export function StockClient() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductOpt[]>([]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    productId: "",
    quantity: "1",
    type: "ADJUST_IN",
    reason: "",
  });

  const [supplierOpen, setSupplierOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierRows, setSupplierRows] = useState<SupplierProductRow[]>([]);
  const [supplierReason, setSupplierReason] = useState("");
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierSaving, setSupplierSaving] = useState(false);

  async function loadMovements() {
    setLoading(true);
    try {
      const res = await fetch("/api/stock/movements?pageSize=50");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMovements(data.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function loadProducts() {
    const res = await fetch("/api/products?pageSize=100&active=true");
    const data = await res.json();
    if (res.ok) {
      setProducts(
        data.items.map(
          (p: {
            id: string;
            name: string;
            internalCode: string;
            currentStock: number;
          }) => ({
            id: p.id,
            name: p.name,
            internalCode: p.internalCode,
            currentStock: p.currentStock,
          }),
        ),
      );
    }
  }

  async function loadSuppliers() {
    try {
      const res = await fetch("/api/suppliers?pageSize=100&active=true");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao listar fornecedores");
      setSuppliers(data.items ?? data);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erro ao carregar fornecedores",
      );
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadMovements();
      void loadProducts();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  async function submitAdjust(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/stock/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: form.productId,
          quantity: Number(form.quantity),
          type: form.type,
          reason: form.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no ajuste");
      toast.success("Estoque ajustado");
      setOpen(false);
      setForm({
        productId: "",
        quantity: "1",
        type: "ADJUST_IN",
        reason: "",
      });
      await loadProducts();
      await loadMovements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function openSupplierAdjust() {
    setSupplierOpen(true);
    setSupplierId("");
    setSupplierRows([]);
    setSupplierReason("");
    await loadSuppliers();
  }

  async function loadSupplierProducts(id: string) {
    setSupplierId(id);
    setSupplierRows([]);
    if (!id) return;
    setSupplierLoading(true);
    try {
      const res = await fetch(`/api/stock/by-supplier?supplierId=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar produtos");
      setSupplierRows(
        (
          data.items as Array<{
            id: string;
            internalCode: string;
            name: string;
            currentStock: number;
            unit?: { code: string } | null;
          }>
        ).map((p) => ({
          ...p,
          type: "ADJUST_IN",
          quantity: "",
        })),
      );
      if (!data.items?.length) {
        toast.message(
          "Nenhum produto vinculado a este fornecedor (compras ou cadastro).",
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSupplierLoading(false);
    }
  }

  function removeSupplierRow(productId: string) {
    setSupplierRows((rows) => rows.filter((r) => r.id !== productId));
  }

  function updateSupplierRow(
    productId: string,
    patch: Partial<Pick<SupplierProductRow, "type" | "quantity">>,
  ) {
    setSupplierRows((rows) =>
      rows.map((r) => (r.id === productId ? { ...r, ...patch } : r)),
    );
  }

  async function submitSupplierAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      toast.error("Selecione o fornecedor");
      return;
    }
    const items = supplierRows
      .filter((r) => Number(r.quantity) > 0)
      .map((r) => ({
        productId: r.id,
        quantity: Number(r.quantity),
        type: r.type,
      }));
    if (items.length === 0) {
      toast.error("Informe a quantidade em ao menos um produto");
      return;
    }
    if (supplierReason.trim().length < 3) {
      toast.error("Justificativa obrigatória");
      return;
    }

    setSupplierSaving(true);
    try {
      const res = await fetch("/api/stock/adjust-by-supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          reason: supplierReason.trim(),
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no ajuste por fornecedor");
      toast.success(`${data.adjusted} produto(s) ajustado(s)`);
      setSupplierOpen(false);
      setSupplierId("");
      setSupplierRows([]);
      setSupplierReason("");
      await loadProducts();
      await loadMovements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSupplierSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Estoque"
        description="Movimentações e ajustes de quantidade com justificativa. Validades ficam em Controle de validade."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadMovements()}
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void openSupplierAdjust()}
            >
              <PackageOpen className="h-4 w-4" />
              Ajuste por fornecedor
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Ajustar estoque
            </Button>
          </>
        }
      />

      <Table>
        <THead>
          <TR>
            <TH>Data</TH>
            <TH>Produto</TH>
            <TH>Tipo</TH>
            <TH>Δ</TH>
            <TH>Saldo</TH>
            <TH>Justificativa</TH>
            <TH>Usuário</TH>
          </TR>
        </THead>
        <TBody>
          {loading ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-zinc-500">
                Carregando...
              </TD>
            </TR>
          ) : !movements.length ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-zinc-500">
                Nenhuma movimentação
              </TD>
            </TR>
          ) : (
            movements.map((m) => (
              <TR key={m.id}>
                <TD className="whitespace-nowrap text-xs">
                  {formatDateTimeBR(m.createdAt)}
                </TD>
                <TD>
                  <div className="text-sm">{m.product.name}</div>
                  <div className="text-xs text-zinc-500">
                    {m.product.internalCode}
                  </div>
                </TD>
                <TD>
                  <Badge variant="muted">
                    {TYPE_LABEL[m.type] ?? m.type}
                  </Badge>
                </TD>
                <TD
                  className={
                    m.qtyDelta < 0 ? "text-red-600" : "text-emerald-600"
                  }
                >
                  {m.qtyDelta > 0 ? "+" : ""}
                  {m.qtyDelta}
                </TD>
                <TD>
                  {m.qtyBefore} → {m.qtyAfter}
                </TD>
                <TD className="max-w-[200px] truncate text-xs text-zinc-600">
                  {m.reason || "—"}
                </TD>
                <TD className="text-xs">{m.user?.name || "—"}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Ajuste de estoque"
        description="Informe produto, tipo, quantidade e justificativa."
      >
        <form onSubmit={submitAdjust} className="space-y-4">
          <div className="space-y-2">
            <Label>Produto *</Label>
            <Select
              required
              value={form.productId}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  productId: e.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.internalCode} — {p.name} (saldo {p.currentStock})
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="ADJUST_IN">Ajuste de entrada</option>
              <option value="ADJUST_OUT">Ajuste de saída</option>
              <option value="LOSS">Perda</option>
              <option value="DAMAGE">Avaria</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantidade *</Label>
            <Input
              type="number"
              min="0.0001"
              step="0.0001"
              required
              value={form.quantity}
              onChange={(e) =>
                setForm((f) => ({ ...f, quantity: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Justificativa *</Label>
            <Input
              required
              minLength={3}
              value={form.reason}
              onChange={(e) =>
                setForm((f) => ({ ...f, reason: e.target.value }))
              }
              placeholder="Motivo do ajuste"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">Confirmar</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={supplierOpen}
        onClose={() => setSupplierOpen(false)}
        title="Ajuste de estoque por fornecedor"
        description="Carrega os produtos do fornecedor. Remova os que não serão ajustados e informe a quantidade dos demais."
        className="sm:max-w-4xl"
      >
        <form onSubmit={submitSupplierAdjust} className="space-y-4">
          <div className="space-y-2">
            <Label>Fornecedor *</Label>
            <Select
              required
              value={supplierId}
              onChange={(e) => void loadSupplierProducts(e.target.value)}
            >
              <option value="">Selecione</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.tradeName || s.legalName}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Justificativa *</Label>
            <Input
              required
              minLength={3}
              value={supplierReason}
              onChange={(e) => setSupplierReason(e.target.value)}
              placeholder="Ex.: Conferência de remessa"
            />
          </div>

          <div className="max-h-[50vh] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <Table>
              <THead>
                <TR>
                  <TH>Código</TH>
                  <TH>Produto</TH>
                  <TH>Saldo</TH>
                  <TH>Tipo</TH>
                  <TH>Qtd. ajuste</TH>
                  <TH className="w-12" />
                </TR>
              </THead>
              <TBody>
                {supplierLoading ? (
                  <TR>
                    <TD colSpan={6} className="py-8 text-center text-zinc-500">
                      Carregando produtos...
                    </TD>
                  </TR>
                ) : !supplierId ? (
                  <TR>
                    <TD colSpan={6} className="py-8 text-center text-zinc-500">
                      Selecione um fornecedor para carregar os produtos.
                    </TD>
                  </TR>
                ) : !supplierRows.length ? (
                  <TR>
                    <TD colSpan={6} className="py-8 text-center text-zinc-500">
                      Nenhum produto na lista.
                    </TD>
                  </TR>
                ) : (
                  supplierRows.map((row) => (
                    <TR key={row.id}>
                      <TD className="font-mono text-xs">{row.internalCode}</TD>
                      <TD>
                        <div className="text-sm font-medium">{row.name}</div>
                      </TD>
                      <TD className="tabular-nums">
                        {row.currentStock.toLocaleString("pt-BR")}
                        {row.unit?.code ? ` ${row.unit.code}` : ""}
                      </TD>
                      <TD>
                        <Select
                          value={row.type}
                          onChange={(e) =>
                            updateSupplierRow(row.id, { type: e.target.value })
                          }
                        >
                          <option value="ADJUST_IN">Entrada</option>
                          <option value="ADJUST_OUT">Saída</option>
                          <option value="LOSS">Perda</option>
                          <option value="DAMAGE">Avaria</option>
                        </Select>
                      </TD>
                      <TD>
                        <Input
                          type="number"
                          min="0"
                          step="0.0001"
                          className="w-28"
                          placeholder="0"
                          value={row.quantity}
                          onChange={(e) =>
                            updateSupplierRow(row.id, {
                              quantity: e.target.value,
                            })
                          }
                        />
                      </TD>
                      <TD>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          title="Remover da lista"
                          onClick={() => removeSupplierRow(row.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>

          <p className="text-xs text-zinc-500">
            Apenas linhas com quantidade &gt; 0 serão ajustadas.
            {supplierRows.length
              ? ` ${supplierRows.filter((r) => Number(r.quantity) > 0).length} de ${supplierRows.length} com quantidade.`
              : ""}
          </p>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSupplierOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={supplierSaving || !supplierRows.length}
            >
              {supplierSaving ? "Salvando..." : "Confirmar ajustes"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
