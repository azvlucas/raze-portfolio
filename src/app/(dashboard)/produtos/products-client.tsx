"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Upload,
  Plus,
  Search,
  Percent,
  RefreshCw,
  Pencil,
  Ban,
} from "lucide-react";
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
import {
  formatBRL,
  formatPercent,
  markupFromPrices,
  salePriceFromMarkup,
} from "@/lib/money";
import { formatDateTimeBR } from "@/lib/date";

type CatalogMeta = {
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  units: { id: string; code: string; name: string }[];
  suppliers: { id: string; legalName: string; tradeName: string | null }[];
};

type PetSize = "SMALL" | "MEDIUM" | "LARGE";

const PET_SIZE_OPTIONS: { value: PetSize; label: string }[] = [
  { value: "SMALL", label: "Pequeno" },
  { value: "MEDIUM", label: "Médio" },
  { value: "LARGE", label: "Grande" },
];

const PET_SIZE_SHORT: Record<PetSize, string> = {
  SMALL: "P",
  MEDIUM: "M",
  LARGE: "G",
};

type Product = {
  id: string;
  internalCode: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  brandId: string | null;
  supplierId: string | null;
  unitId: string;
  costPrice: number;
  markupPercent: number;
  salePrice: number;
  currentStock: number;
  minStock: number;
  location: string | null;
  trackExpiry: boolean;
  petSizes: PetSize[];
  active: boolean;
  marginPercent: number;
  stockStatus: "out" | "low" | "ok";
  category?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  supplier?: {
    id: string;
    legalName: string;
    tradeName: string | null;
  } | null;
  unit?: { id: string; code: string; name: string } | null;
  priceHistory?: Array<{
    id: string;
    costPrice: number | null;
    salePrice: number | null;
    reason: string | null;
    createdAt: string;
  }>;
};

type ListResponse = {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const emptyForm = {
  barcode: "",
  name: "",
  description: "",
  categoryId: "",
  brandId: "",
  supplierId: "",
  unitId: "",
  costPrice: "0",
  markupPercent: "0",
  salePrice: "0",
  minStock: "0",
  location: "",
  petSizes: [] as PetSize[],
  trackExpiry: false,
  active: true,
  priceChangeReason: "",
};

export function ProductsClient({ canViewMargins }: { canViewMargins: boolean }) {
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [petSizeFilter, setPetSizeFilter] = useState("");
  const [active, setActive] = useState("all");
  const [stock, setStock] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPercent, setBulkPercent] = useState("10");
  const [bulkField, setBulkField] = useState<"salePrice" | "costPrice">(
    "salePrice",
  );

  const [auxOpen, setAuxOpen] = useState<"category" | "brand" | "unit" | null>(
    null,
  );
  const [auxName, setAuxName] = useState("");
  const [auxCode, setAuxCode] = useState("");

  const queryString = useMemo(() => {
    const p = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      search,
      active,
      stock,
      sortBy,
      sortDir,
    });
    if (categoryId) p.set("categoryId", categoryId);
    if (brandId) p.set("brandId", brandId);
    if (supplierId) p.set("supplierId", supplierId);
    if (petSizeFilter) p.set("petSize", petSizeFilter);
    return p.toString();
  }, [
    page,
    search,
    active,
    stock,
    sortBy,
    sortDir,
    categoryId,
    brandId,
    supplierId,
    petSizeFilter,
  ]);

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/catalog/meta");
    if (!res.ok) throw new Error("Falha ao carregar catálogo auxiliar");
    setMeta(await res.json());
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/products?${queryString}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao listar");
      }
      setData(await res.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao listar produtos");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/catalog/meta");
        if (!res.ok) throw new Error("Falha ao carregar catálogo auxiliar");
        const json = await res.json();
        if (!cancelled) setMeta(json);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Erro no catálogo");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (!cancelled) setLoading(true);
        try {
          const res = await fetch(`/api/products?${queryString}`);
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Erro ao listar");
          }
          const json = await res.json();
          if (!cancelled) setData(json);
        } catch (e) {
          if (!cancelled) {
            toast.error(
              e instanceof Error ? e.message : "Erro ao listar produtos",
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [queryString]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      unitId: meta?.units[0]?.id || "",
    });
    setDialogOpen(true);
  }

  async function openEdit(product: Product) {
    const res = await fetch(`/api/products/${product.id}`);
    if (!res.ok) {
      toast.error("Não foi possível carregar o produto");
      return;
    }
    const full: Product = await res.json();
    setEditing(full);
    setForm({
      barcode: full.barcode || "",
      name: full.name,
      description: full.description || "",
      categoryId: full.categoryId || "",
      brandId: full.brandId || "",
      supplierId: full.supplierId || "",
      unitId: full.unitId,
      costPrice: String(full.costPrice),
      markupPercent: String(
        full.markupPercent ??
          markupFromPrices(full.costPrice, full.salePrice),
      ),
      salePrice: String(full.salePrice),
      minStock: String(full.minStock),
      location: full.location || "",
      petSizes: full.petSizes ?? [],
      trackExpiry: full.trackExpiry,
      active: full.active,
      priceChangeReason: "",
    });
    setDialogOpen(true);
  }

  function togglePetSize(size: PetSize) {
    setForm((f) => {
      const has = f.petSizes.includes(size);
      return {
        ...f,
        petSizes: has
          ? f.petSizes.filter((s) => s !== size)
          : [...f.petSizes, size],
      };
    });
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        barcode: form.barcode || null,
        name: form.name,
        description: form.description || null,
        categoryId: form.categoryId || null,
        brandId: form.brandId || null,
        supplierId: form.supplierId || null,
        unitId: form.unitId,
        costPrice: Number(form.costPrice),
        markupPercent: Number(form.markupPercent) || 0,
        salePrice: Number(form.salePrice),
        minStock: Number(form.minStock),
        location: form.location || null,
        petSizes: form.petSizes,
        // Validade fica em Movimentações → Controle de validade (não no estoque/lotes)
        trackExpiry: false,
        active: form.active,
        priceChangeReason: form.priceChangeReason || null,
        imageUrl: null,
      };

      const res = await fetch(
        editing ? `/api/products/${editing.id}` : "/api/products",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha ao salvar");
      toast.success(editing ? "Produto atualizado" : "Produto criado");
      setDialogOpen(false);
      await loadProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(product: Product) {
    if (!confirm(`Inativar o produto "${product.name}"?`)) return;
    const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error || "Falha ao inativar");
      return;
    }
    toast.success("Produto inativado");
    await loadProducts();
  }

  async function exportCsv() {
    const res = await fetch(`/api/products/export?${queryString}`);
    if (!res.ok) {
      toast.error("Falha na exportação");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `produtos-raze.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  }

  async function importCsv(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/products/import", { method: "POST", body: fd });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error || "Falha na importação");
      return;
    }
    toast.success(
      `Importação: ${body.created} criados, ${body.updated} atualizados`,
    );
    if (body.errors?.length) {
      toast.message(`${body.errors.length} linha(s) com erro`);
    }
    await loadMeta();
    await loadProducts();
  }

  async function applyBulkPrice() {
    if (selected.size === 0) {
      toast.error("Selecione ao menos um produto");
      return;
    }
    const res = await fetch("/api/products/bulk-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: Array.from(selected),
        percent: Number(bulkPercent),
        field: bulkField,
        reason: `Reajuste em massa ${bulkPercent}%`,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error || "Falha no reajuste");
      return;
    }
    toast.success(`${body.updated} produto(s) reajustados`);
    setBulkOpen(false);
    setSelected(new Set());
    await loadProducts();
  }

  async function saveAux() {
    if (!auxOpen) return;
    try {
      let url = "/api/catalog/categories";
      let payload: Record<string, unknown> = { name: auxName, active: true };
      if (auxOpen === "brand") {
        url = "/api/catalog/brands";
      } else if (auxOpen === "unit") {
        url = "/api/catalog/units";
        payload = { code: auxCode, name: auxName || auxCode, active: true };
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Erro");
      toast.success("Cadastro auxiliar criado");
      setAuxOpen(null);
      setAuxName("");
      setAuxCode("");
      await loadMeta();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSort(col: string) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  }

  const stockBadge = (status: Product["stockStatus"]) => {
    if (status === "out") return <Badge variant="danger">Sem estoque</Badge>;
    if (status === "low") return <Badge variant="warning">Abaixo mínimo</Badge>;
    return <Badge variant="success">OK</Badge>;
  };

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Catálogo com preços, margens, filtros e importação/exportação CSV."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => loadProducts()}>
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCsv(f);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 px-3 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                <Upload className="h-4 w-4" />
                Importar CSV
              </span>
            </label>
            <Button
              variant="secondary"
              size="sm"
              disabled={selected.size === 0}
              onClick={() => setBulkOpen(true)}
            >
              <Percent className="h-4 w-4" />
              Reajuste ({selected.size})
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Novo produto
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:grid-cols-2 xl:grid-cols-7">
        <div className="xl:col-span-2">
          <Label className="mb-1.5 block">Pesquisar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              className="pl-9"
              placeholder="Nome, código ou código de barras"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div>
          <Label className="mb-1.5 block">Categoria</Label>
          <Select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {meta?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block">Marca</Label>
          <Select
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {meta?.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block">Fornecedor</Label>
          <Select
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {meta?.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.tradeName || s.legalName}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block">Porte</Label>
          <Select
            value={petSizeFilter}
            onChange={(e) => {
              setPetSizeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {PET_SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block">Status</Label>
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
        <div>
          <Label className="mb-1.5 block">Estoque</Label>
          <Select
            value={stock}
            onChange={(e) => {
              setStock(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="out">Sem estoque</option>
            <option value="low">Abaixo do mínimo</option>
            <option value="ok">Acima do mínimo</option>
          </Select>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setAuxOpen("category")}>
          + Categoria
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAuxOpen("brand")}>
          + Marca
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAuxOpen("unit")}>
          + Unidade
        </Button>
        <span className="self-center text-xs text-zinc-500">
          {data ? `${data.total} produto(s)` : ""}
        </span>
      </div>

      <Table>
        <THead>
          <TR>
            <TH className="w-10">
              <span className="sr-only">Selecionar</span>
            </TH>
            <TH>
              <button type="button" onClick={() => toggleSort("internalCode")}>
                Código
              </button>
            </TH>
            <TH>
              <button type="button" onClick={() => toggleSort("name")}>
                Nome
              </button>
            </TH>
            <TH>Categoria</TH>
            <TH>Marca</TH>
            <TH>Fornecedor</TH>
            <TH>Portes</TH>
            {canViewMargins ? (
              <TH>
                <button type="button" onClick={() => toggleSort("costPrice")}>
                  Custo
                </button>
              </TH>
            ) : null}
            <TH>
              <button type="button" onClick={() => toggleSort("salePrice")}>
                Preço
              </button>
            </TH>
            {canViewMargins ? <TH>Margem</TH> : null}
            <TH>
              <button type="button" onClick={() => toggleSort("currentStock")}>
                Estoque
              </button>
            </TH>
            <TH>Situação</TH>
            <TH className="text-right">Ações</TH>
          </TR>
        </THead>
        <TBody>
          {loading ? (
            <TR>
              <TD colSpan={13} className="py-10 text-center text-zinc-500">
                Carregando...
              </TD>
            </TR>
          ) : !data?.items.length ? (
            <TR>
              <TD colSpan={13} className="py-10 text-center text-zinc-500">
                Nenhum produto encontrado
              </TD>
            </TR>
          ) : (
            data.items.map((p) => (
              <TR key={p.id} className={!p.active ? "opacity-60" : undefined}>
                <TD>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    aria-label={`Selecionar ${p.name}`}
                  />
                </TD>
                <TD className="font-mono text-xs">{p.internalCode}</TD>
                <TD>
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">
                    {p.name}
                  </div>
                  {p.barcode ? (
                    <div className="text-xs text-zinc-500">{p.barcode}</div>
                  ) : null}
                </TD>
                <TD>{p.category?.name || "—"}</TD>
                <TD>{p.brand?.name || "—"}</TD>
                <TD className="text-sm">
                  {p.supplier
                    ? p.supplier.tradeName || p.supplier.legalName
                    : "—"}
                </TD>
                <TD>
                  {p.petSizes?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {p.petSizes.map((s) => (
                        <Badge key={s} variant="muted">
                          {PET_SIZE_SHORT[s]}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </TD>
                {canViewMargins ? <TD>{formatBRL(p.costPrice)}</TD> : null}
                <TD>{formatBRL(p.salePrice)}</TD>
                {canViewMargins ? (
                  <TD>{formatPercent(p.marginPercent)}</TD>
                ) : null}
                <TD>
                  <span className="font-medium">
                    {p.currentStock.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {" "}
                    / min {p.minStock}
                  </span>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {stockBadge(p.stockStatus)}
                    {!p.active ? <Badge variant="muted">Inativo</Badge> : null}
                  </div>
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(p)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {p.active ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deactivate(p)}
                        aria-label="Inativar"
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

      {data && data.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Página {data.page} de {data.totalPages}
          </p>
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
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      ) : null}

      {/* Product form */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? "Editar produto" : "Novo produto"}
        description="Campos de custo e preço geram histórico quando alterados."
        className="sm:max-w-3xl"
      >
        <form onSubmit={saveProduct} className="grid gap-4 sm:grid-cols-2">
          {editing ? (
            <div className="space-y-2">
              <Label>Código interno</Label>
              <Input value={editing.internalCode} disabled readOnly />
              <p className="text-xs text-zinc-500">
                Gerado automaticamente; não pode ser alterado.
              </p>
            </div>
          ) : (
            <div className="space-y-2 sm:col-span-2 rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              O código interno será definido automaticamente (primeiro livre).
            </div>
          )}
          <div className="space-y-2">
            <Label>Código de barras</Label>
            <Input
              value={form.barcode}
              onChange={(e) =>
                setForm((f) => ({ ...f, barcode: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Nome *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select
              value={form.categoryId}
              onChange={(e) =>
                setForm((f) => ({ ...f, categoryId: e.target.value }))
              }
            >
              <option value="">—</option>
              {meta?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Marca</Label>
            <Select
              value={form.brandId}
              onChange={(e) =>
                setForm((f) => ({ ...f, brandId: e.target.value }))
              }
            >
              <option value="">—</option>
              {meta?.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Fornecedor</Label>
            <Select
              value={form.supplierId}
              onChange={(e) =>
                setForm((f) => ({ ...f, supplierId: e.target.value }))
              }
            >
              <option value="">—</option>
              {meta?.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.tradeName || s.legalName}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Unidade *</Label>
            <Select
              required
              value={form.unitId}
              onChange={(e) =>
                setForm((f) => ({ ...f, unitId: e.target.value }))
              }
            >
              <option value="" disabled>
                Selecione
              </option>
              {meta?.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Localização</Label>
            <Input
              value={form.location}
              onChange={(e) =>
                setForm((f) => ({ ...f, location: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Porte do pet</Label>
            <p className="text-xs text-zinc-500">
              Marque um ou mais: o produto pode servir para pequeno, médio e/ou
              grande.
            </p>
            <div className="flex flex-wrap gap-4 pt-1">
              {PET_SIZE_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.petSizes.includes(o.value)}
                    onChange={() => togglePetSize(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Custo (R$)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.costPrice}
              onChange={(e) => {
                const costPrice = e.target.value;
                const markup = Number(form.markupPercent) || 0;
                const cost = Number(costPrice) || 0;
                setForm((f) => ({
                  ...f,
                  costPrice,
                  salePrice:
                    markup > 0 && cost > 0
                      ? String(salePriceFromMarkup(cost, markup))
                      : f.salePrice,
                }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Markup (%)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.markupPercent}
              onChange={(e) => {
                const markupPercent = e.target.value;
                const cost = Number(form.costPrice) || 0;
                const markup = Number(markupPercent) || 0;
                setForm((f) => ({
                  ...f,
                  markupPercent,
                  salePrice:
                    cost > 0 && markup >= 0
                      ? String(salePriceFromMarkup(cost, markup))
                      : f.salePrice,
                }));
              }}
            />
            <p className="text-xs text-zinc-500">
              Com custo e markup, o preço de venda é calculado automaticamente.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Preço de venda (R$)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.salePrice}
              onChange={(e) => {
                const salePrice = e.target.value;
                const cost = Number(form.costPrice) || 0;
                const sale = Number(salePrice) || 0;
                setForm((f) => ({
                  ...f,
                  salePrice,
                  markupPercent:
                    cost > 0 && sale > 0
                      ? String(markupFromPrices(cost, sale))
                      : f.markupPercent,
                }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Estoque mínimo</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.minStock}
              onChange={(e) =>
                setForm((f) => ({ ...f, minStock: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Motivo alteração de preço</Label>
            <Input
              placeholder="Opcional"
              value={form.priceChangeReason}
              onChange={(e) =>
                setForm((f) => ({ ...f, priceChangeReason: e.target.value }))
              }
            />
          </div>
          <div className="flex items-center gap-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm((f) => ({ ...f, active: e.target.checked }))
                }
              />
              Ativo
            </label>
            {canViewMargins ? (
              <span className="text-sm text-zinc-500">
                Margem:{" "}
                {formatPercent(
                  Number(form.salePrice) > 0
                    ? ((Number(form.salePrice) - Number(form.costPrice)) /
                        Number(form.salePrice)) *
                        100
                    : 0,
                )}
              </span>
            ) : null}
          </div>

          {editing?.priceHistory?.length ? (
            <div className="sm:col-span-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="mb-2 text-sm font-medium">Histórico de preço</p>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-zinc-600 dark:text-zinc-400">
                {editing.priceHistory.map((h) => (
                  <li key={h.id}>
                    {formatDateTimeBR(h.createdAt)} — custo{" "}
                    {formatBRL(h.costPrice)} · venda {formatBRL(h.salePrice)}
                    {h.reason ? ` · ${h.reason}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Bulk price */}
      <Dialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Reajuste percentual"
        description={`${selected.size} produto(s) selecionado(s)`}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Campo</Label>
            <Select
              value={bulkField}
              onChange={(e) =>
                setBulkField(e.target.value as "salePrice" | "costPrice")
              }
            >
              <option value="salePrice">Preço de venda</option>
              <option value="costPrice">Custo</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Percentual (ex: 10 ou -5)</Label>
            <Input
              type="number"
              step="0.01"
              value={bulkPercent}
              onChange={(e) => setBulkPercent(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={applyBulkPrice}>Aplicar</Button>
          </div>
        </div>
      </Dialog>

      {/* Aux dialog */}
      <Dialog
        open={!!auxOpen}
        onClose={() => setAuxOpen(null)}
        title={
          auxOpen === "category"
            ? "Nova categoria"
            : auxOpen === "brand"
              ? "Nova marca"
              : "Nova unidade"
        }
      >
        <div className="space-y-4">
          {auxOpen === "unit" ? (
            <div className="space-y-2">
              <Label>Código</Label>
              <Input
                value={auxCode}
                onChange={(e) => setAuxCode(e.target.value)}
                placeholder="UN"
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={auxName}
              onChange={(e) => setAuxName(e.target.value)}
              placeholder="Nome"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAuxOpen(null)}>
              Cancelar
            </Button>
            <Button onClick={saveAux}>Salvar</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
