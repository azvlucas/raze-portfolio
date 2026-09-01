"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, RefreshCw, Save, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDateBR } from "@/lib/date";

type Mode = "product" | "supplier" | "with_stock";

type SupplierOpt = {
  id: string;
  legalName: string;
  tradeName: string | null;
};

type ExpiryItem = {
  id: string;
  expiresAt: string;
  notes: string | null;
  daysToExpiry: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
};

type ProductRow = {
  id: string;
  internalCode: string;
  name: string;
  currentStock: number;
  unitCode: string | null;
  supplier: { id: string; legalName: string; tradeName: string | null } | null;
  expiresAt: string | null;
  daysToExpiry: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
  needsExpirySetup: boolean;
  expiries: ExpiryItem[];
};

type RowEdit = {
  selected: boolean;
  expiresAt: string;
};

export function ExpiryControlClient() {
  const [mode, setMode] = useState<Mode>("with_stock");
  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [items, setItems] = useState<ProductRow[]>([]);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkDate, setBulkDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [alertDays, setAlertDays] = useState(30);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch("/api/suppliers?pageSize=100&active=true");
      const data = await res.json();
      if (res.ok) setSuppliers(data.items ?? []);
    } catch {
      /* optional */
    }
  }, []);

  const loadProducts = useCallback(async () => {
    if (mode === "supplier" && !supplierId) {
      setItems([]);
      setEdits({});
      setTotal(0);
      setTotalPages(1);
      return;
    }
    if (mode === "product" && !search.trim()) {
      setItems([]);
      setEdits({});
      setTotal(0);
      setTotalPages(1);
      return;
    }

    setLoading(true);
    try {
      const p = new URLSearchParams({
        mode,
        page: String(page),
        pageSize: "50",
      });
      if (search.trim()) p.set("search", search.trim());
      if (mode === "supplier" && supplierId) p.set("supplierId", supplierId);

      const res = await fetch(`/api/stock/expiry-control?${p}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao listar");

      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      if (typeof data.daysToExpiryAlert === "number") {
        setAlertDays(data.daysToExpiryAlert);
      }

      const next: Record<string, RowEdit> = {};
      for (const row of data.items as ProductRow[]) {
        next[row.id] = {
          selected: false,
          expiresAt: "",
        };
      }
      setEdits(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao listar");
    } finally {
      setLoading(false);
    }
  }, [mode, search, supplierId, page]);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadProducts();
    }, mode === "product" ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [loadProducts, mode]);

  function patchEdit(productId: string, patch: Partial<RowEdit>) {
    setEdits((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] ?? { selected: false, expiresAt: "" }),
        ...patch,
      },
    }));
  }

  const selectedCount = useMemo(
    () => Object.values(edits).filter((e) => e.selected).length,
    [edits],
  );

  function toggleAll(checked: boolean) {
    setEdits((prev) => {
      const next = { ...prev };
      for (const row of items) {
        next[row.id] = {
          ...(next[row.id] ?? { selected: false, expiresAt: "" }),
          selected: checked,
        };
      }
      return next;
    });
  }

  function applyBulkDate() {
    if (!bulkDate) {
      toast.error("Informe a data para aplicar em lote");
      return;
    }
    setEdits((prev) => {
      const next = { ...prev };
      for (const row of items) {
        if (!next[row.id]?.selected) continue;
        next[row.id] = { ...next[row.id], expiresAt: bulkDate };
      }
      return next;
    });
    toast.success("Data preenchida nos selecionados (será adicionada ao histórico)");
  }

  async function save() {
    const payloadItems = items
      .filter((row) => edits[row.id]?.selected && edits[row.id]?.expiresAt)
      .map((row) => ({
        productId: row.id,
        expiresAt: edits[row.id].expiresAt,
      }));

    // também permite salvar linhas com data preenchida mesmo sem checkbox? User selects then saves.
    if (payloadItems.length === 0) {
      toast.error(
        "Selecione produtos e informe a nova data de validade a adicionar",
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/stock/expiry-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payloadItems }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      toast.success(
        `${data.created ?? data.updated} validade(s) adicionada(s) ao histórico`,
      );
      await loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function addOne(productId: string) {
    const date = edits[productId]?.expiresAt;
    if (!date) {
      toast.error("Informe a data na linha do produto");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/stock/expiry-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId, expiresAt: date }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao adicionar");
      toast.success("Validade adicionada");
      await loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function removeExpiry(expiryId: string) {
    if (!confirm("Remover esta data de validade do produto?")) return;
    try {
      const res = await fetch(`/api/stock/expiry-control/${expiryId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao remover");
      toast.success("Validade removida");
      await loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    }
  }

  function statusBadges(row: ProductRow) {
    if (row.needsExpirySetup) {
      return <Badge variant="warning">Sem validade</Badge>;
    }
    if (row.isExpired) {
      return <Badge variant="danger">Vencido</Badge>;
    }
    if (row.isExpiringSoon) {
      return (
        <Badge variant="warning">
          {row.daysToExpiry === 0
            ? "Vence hoje"
            : `${row.daysToExpiry}d restantes`}
        </Badge>
      );
    }
    return (
      <Badge variant="success">
        {row.daysToExpiry != null ? `${row.daysToExpiry}d` : "OK"}
      </Badge>
    );
  }

  function expiryChip(e: ExpiryItem) {
    const variant = e.isExpired
      ? "danger"
      : e.isExpiringSoon
        ? "warning"
        : "muted";
    return (
      <span
        key={e.id}
        className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white py-0.5 pl-2 pr-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      >
        <Badge variant={variant} className="!px-1.5 !py-0">
          {formatDateBR(e.expiresAt)}
        </Badge>
        {e.daysToExpiry != null ? (
          <span className="text-zinc-500">
            {e.isExpired
              ? `${Math.abs(e.daysToExpiry)}d atrás`
              : e.daysToExpiry === 0
                ? "hoje"
                : `${e.daysToExpiry}d`}
          </span>
        ) : null}
        <button
          type="button"
          className="rounded-full p-0.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
          title="Remover validade"
          onClick={() => void removeExpiry(e.id)}
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <div>
      <PageHeader
        title="Controle de validade"
        description="Cadastre várias datas de validade por produto (histórico). Quando a data estiver próxima, o estoquista confere."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadProducts()}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={saving || selectedCount === 0}
            >
              <Save className="h-4 w-4" />
              Adicionar nos selecionados ({selectedCount})
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="mb-1.5 block">Selecionar por</Label>
            <Select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as Mode);
                setPage(1);
              }}
            >
              <option value="with_stock">Apenas com estoque</option>
              <option value="supplier">Por fornecedor</option>
              <option value="product">Por produto</option>
            </Select>
          </div>

          {mode === "supplier" ? (
            <div>
              <Label className="mb-1.5 block">Fornecedor</Label>
              <Select
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Selecione</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.tradeName || s.legalName}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className={mode === "product" ? "sm:col-span-2" : undefined}>
            <Label className="mb-1.5 block">
              {mode === "product" ? "Produto (nome ou código)" : "Busca opcional"}
            </Label>
            <Input
              placeholder={
                mode === "product"
                  ? "Digite para buscar..."
                  : "Filtrar nome/código na lista"
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <div className="min-w-[160px]">
              <Label className="mb-1.5 block">Nova data (lote)</Label>
              <Input
                type="date"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={applyBulkDate}
              disabled={selectedCount === 0}
            >
              <CalendarClock className="h-4 w-4" />
              Preencher nos selecionados
            </Button>
            <span className="self-center text-xs text-zinc-500">
              Cada salvamento <strong>adiciona</strong> uma data ao histórico (não
              apaga as anteriores). Alerta: {alertDays} dias.
              {total ? ` · ${total} produto(s)` : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      <Table>
        <THead>
          <TR>
            <TH className="w-10">
              <input
                type="checkbox"
                aria-label="Selecionar todos"
                checked={
                  items.length > 0 &&
                  items.every((r) => edits[r.id]?.selected)
                }
                onChange={(e) => toggleAll(e.target.checked)}
              />
            </TH>
            <TH>Produto</TH>
            <TH>Fornecedor</TH>
            <TH>Estoque</TH>
            <TH>Próxima</TH>
            <TH>Validades cadastradas</TH>
            <TH>Adicionar data</TH>
          </TR>
        </THead>
        <TBody>
          {loading ? (
            <TR>
              <TD colSpan={7} className="py-10 text-center text-zinc-500">
                Carregando...
              </TD>
            </TR>
          ) : mode === "supplier" && !supplierId ? (
            <TR>
              <TD colSpan={7} className="py-10 text-center text-zinc-500">
                Selecione um fornecedor para listar os produtos.
              </TD>
            </TR>
          ) : mode === "product" && !search.trim() ? (
            <TR>
              <TD colSpan={7} className="py-10 text-center text-zinc-500">
                Digite o nome ou código do produto para buscar.
              </TD>
            </TR>
          ) : !items.length ? (
            <TR>
              <TD colSpan={7} className="py-10 text-center text-zinc-500">
                Nenhum produto encontrado com este filtro.
              </TD>
            </TR>
          ) : (
            items.map((row) => {
              const edit = edits[row.id] ?? {
                selected: false,
                expiresAt: "",
              };
              return (
                <TR
                  key={row.id}
                  className={
                    row.isExpired
                      ? "bg-red-50/50 dark:bg-red-950/20"
                      : row.isExpiringSoon || row.needsExpirySetup
                        ? "bg-amber-50/40 dark:bg-amber-950/10"
                        : undefined
                  }
                >
                  <TD>
                    <input
                      type="checkbox"
                      checked={edit.selected}
                      onChange={(e) =>
                        patchEdit(row.id, { selected: e.target.checked })
                      }
                      aria-label={`Selecionar ${row.name}`}
                    />
                  </TD>
                  <TD>
                    <div className="font-medium">{row.name}</div>
                    <div className="font-mono text-xs text-zinc-500">
                      {row.internalCode}
                    </div>
                  </TD>
                  <TD className="text-sm">
                    {row.supplier
                      ? row.supplier.tradeName || row.supplier.legalName
                      : "—"}
                  </TD>
                  <TD className="tabular-nums">
                    {row.currentStock.toLocaleString("pt-BR")}
                    {row.unitCode ? ` ${row.unitCode}` : ""}
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-1">
                      {statusBadges(row)}
                      {row.expiresAt ? (
                        <span className="text-xs text-zinc-500">
                          {formatDateBR(row.expiresAt)}
                        </span>
                      ) : null}
                    </div>
                  </TD>
                  <TD>
                    {row.expiries.length === 0 ? (
                      <span className="text-xs text-zinc-400">Nenhuma</span>
                    ) : (
                      <div className="flex max-w-md flex-wrap gap-1.5">
                        {row.expiries.map((e) => expiryChip(e))}
                      </div>
                    )}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        className="w-40"
                        value={edit.expiresAt}
                        onChange={(e) =>
                          patchEdit(row.id, { expiresAt: e.target.value })
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving || !edit.expiresAt}
                        onClick={() => void addOne(row.id)}
                      >
                        +
                      </Button>
                    </div>
                  </TD>
                </TR>
              );
            })
          )}
        </TBody>
      </Table>

      {totalPages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-zinc-500">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
