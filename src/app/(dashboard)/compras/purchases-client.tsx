"use client";

import { useEffect, useMemo, useState } from "react";
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
  Check,
  Send,
  PackageCheck,
  Printer,
  XCircle,
} from "lucide-react";

type SupplierOpt = { id: string; legalName: string; tradeName: string | null };
type ProductOpt = {
  id: string;
  name: string;
  internalCode: string;
  costPrice: number;
  trackExpiry: boolean;
};

type OrderListItem = {
  id: string;
  number: number;
  status: string;
  issueDate: string;
  expectedDate: string | null;
  grandTotal: number;
  supplier: { legalName: string; tradeName: string | null };
  user: { name: string };
  itemCount: number;
};

type OrderDetail = {
  id: string;
  number: number;
  status: string;
  supplierId: string;
  expectedDate: string | null;
  paymentTerms: string | null;
  notes: string | null;
  discountTotal: number;
  freight: number;
  otherExpenses: number;
  productsTotal: number;
  grandTotal: number;
  editable: boolean;
  receivable: boolean;
  supplier: { legalName: string };
  user: { name: string };
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitCost: number;
    discount: number;
    total: number;
    qtyReceived: number;
    qtyPending: number;
    product: {
      name: string;
      internalCode: string;
      trackExpiry: boolean;
      costPrice: number;
    };
  }>;
  receipts: Array<{
    id: string;
    receivedAt: string;
    notes: string | null;
    user: { name: string };
  }>;
};

type FormItem = {
  productId: string;
  quantity: string;
  unitCost: string;
  discount: string;
};

const statusVariant: Record<
  string,
  "default" | "success" | "warning" | "danger" | "muted"
> = {
  DRAFT: "muted",
  AWAITING_APPROVAL: "warning",
  APPROVED: "default",
  SENT_TO_SUPPLIER: "default",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  CANCELLED: "danger",
};

export function PurchasesClient() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    supplierId: "",
    expectedDate: "",
    paymentTerms: "",
    notes: "",
    discountTotal: "0",
    freight: "0",
    otherExpenses: "0",
    items: [{ productId: "", quantity: "1", unitCost: "0", discount: "0" }] as FormItem[],
  });

  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveLines, setReceiveLines] = useState<
    Record<
      string,
      { quantity: string; unitCost: string; batchCode: string; expiresAt: string; divergenceNotes: string }
    >
  >({});

  async function loadOrders() {
    const p = new URLSearchParams({
      page: "1",
      pageSize: "50",
      status,
      search,
    });
    const res = await fetch(`/api/purchases?${p}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro ao listar pedidos");
      return;
    }
    setOrders(data.items);
    setTotal(data.total);
  }

  async function loadMeta() {
    const [sRes, pRes] = await Promise.all([
      fetch("/api/suppliers?pageSize=100&active=true"),
      fetch("/api/products?pageSize=100&active=true"),
    ]);
    const sData = await sRes.json();
    const pData = await pRes.json();
    if (sRes.ok) setSuppliers(sData.items);
    if (pRes.ok) {
      setProducts(
        pData.items.map(
          (p: {
            id: string;
            name: string;
            internalCode: string;
            costPrice: number;
            trackExpiry: boolean;
          }) => p,
        ),
      );
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadMeta();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadOrders();
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search]);

  const formTotals = useMemo(() => {
    const productsTotal = form.items.reduce((sum, i) => {
      const q = Number(i.quantity) || 0;
      const c = Number(i.unitCost) || 0;
      const d = Number(i.discount) || 0;
      return sum + (q * c - d);
    }, 0);
    const grand =
      productsTotal -
      (Number(form.discountTotal) || 0) +
      (Number(form.freight) || 0) +
      (Number(form.otherExpenses) || 0);
    return { productsTotal, grand };
  }, [form]);

  function openCreate() {
    setForm({
      supplierId: suppliers[0]?.id || "",
      expectedDate: "",
      paymentTerms: "",
      notes: "",
      discountTotal: "0",
      freight: "0",
      otherExpenses: "0",
      items: [
        {
          productId: products[0]?.id || "",
          quantity: "10",
          unitCost: String(products[0]?.costPrice ?? 0),
          discount: "0",
        },
      ],
    });
    setFormOpen(true);
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/purchases/${id}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    setDetail(data);
  }

  async function createOrder(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      supplierId: form.supplierId,
      expectedDate: form.expectedDate || null,
      paymentTerms: form.paymentTerms || null,
      notes: form.notes || null,
      discountTotal: Number(form.discountTotal) || 0,
      freight: Number(form.freight) || 0,
      otherExpenses: Number(form.otherExpenses) || 0,
      items: form.items.map((i) => ({
        productId: i.productId,
        quantity: Number(i.quantity),
        unitCost: Number(i.unitCost),
        discount: Number(i.discount) || 0,
      })),
    };
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro ao criar pedido");
      return;
    }
    toast.success(`Pedido PC-${data.number} criado`);
    setFormOpen(false);
    await loadOrders();
    await openDetail(data.id);
  }

  async function statusAction(
    action: "submit_approval" | "approve" | "send" | "cancel",
  ) {
    if (!detail) return;
    if (action === "cancel" && !confirm("Cancelar este pedido?")) return;
    const res = await fetch(`/api/purchases/${detail.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Falha na alteração de status");
      return;
    }
    toast.success(`Status: ${data.status}`);
    await openDetail(detail.id);
    await loadOrders();
  }

  function openReceive() {
    if (!detail) return;
    const map: typeof receiveLines = {};
    for (const item of detail.items) {
      if (item.qtyPending <= 0) continue;
      map[item.id] = {
        quantity: String(item.qtyPending),
        unitCost: String(item.unitCost),
        batchCode: "",
        expiresAt: "",
        divergenceNotes: "",
      };
    }
    setReceiveLines(map);
    setReceiveOpen(true);
  }

  async function submitReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    const items = detail.items
      .filter((i) => receiveLines[i.id] && Number(receiveLines[i.id].quantity) > 0)
      .map((i) => {
        const line = receiveLines[i.id];
        return {
          purchaseOrderItemId: i.id,
          productId: i.productId,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
          batchCode: line.batchCode || null,
          expiresAt: line.expiresAt || null,
          divergenceNotes: line.divergenceNotes || null,
        };
      });
    if (!items.length) {
      toast.error("Informe quantidades a receber");
      return;
    }
    const res = await fetch(`/api/purchases/${detail.id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: null, items }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Falha no recebimento");
      return;
    }
    toast.success(`Recebimento OK · status ${data.order.status}`);
    setReceiveOpen(false);
    setDetail(data.order);
    await loadOrders();
  }

  function printOrder() {
    if (!detail) return;
    window.open(`/api/purchases/${detail.id}/print`, "_blank");
  }

  return (
    <div>
      <PageHeader
        title="Pedidos de compra"
        description="Emissão, aprovação, envio e recebimento parcial/total com atualização de estoque."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo pedido
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input
          placeholder="Buscar nº ou fornecedor"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Todos os status</option>
          <option value="DRAFT">Rascunho</option>
          <option value="AWAITING_APPROVAL">Aguardando aprovação</option>
          <option value="APPROVED">Aprovado</option>
          <option value="SENT_TO_SUPPLIER">Enviado</option>
          <option value="PARTIALLY_RECEIVED">Parcialmente recebido</option>
          <option value="RECEIVED">Recebido</option>
          <option value="CANCELLED">Cancelado</option>
        </Select>
        <p className="self-center text-sm text-zinc-500">{total} pedido(s)</p>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Nº</TH>
            <TH>Fornecedor</TH>
            <TH>Status</TH>
            <TH>Emissão</TH>
            <TH>Itens</TH>
            <TH>Total</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {!orders.length ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-zinc-500">
                Nenhum pedido de compra
              </TD>
            </TR>
          ) : (
            orders.map((o) => (
              <TR key={o.id}>
                <TD className="font-mono">PC-{o.number}</TD>
                <TD>{o.supplier.tradeName || o.supplier.legalName}</TD>
                <TD>
                  <Badge variant={statusVariant[o.status] || "muted"}>
                    {o.status}
                  </Badge>
                </TD>
                <TD className="text-xs">{formatDateBR(o.issueDate)}</TD>
                <TD>{o.itemCount}</TD>
                <TD>{formatBRL(o.grandTotal)}</TD>
                <TD className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openDetail(o.id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      {/* Create dialog */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Novo pedido de compra"
        className="sm:max-w-3xl"
      >
        <form onSubmit={createOrder} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Fornecedor *</Label>
              <Select
                required
                value={form.supplierId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, supplierId: e.target.value }))
                }
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
              <Label>Previsão de entrega</Label>
              <Input
                type="date"
                value={form.expectedDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expectedDate: e.target.value }))
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
            <div className="space-y-2">
              <Label>Frete</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.freight}
                onChange={(e) =>
                  setForm((f) => ({ ...f, freight: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Itens</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    items: [
                      ...f.items,
                      {
                        productId: products[0]?.id || "",
                        quantity: "1",
                        unitCost: String(products[0]?.costPrice ?? 0),
                        discount: "0",
                      },
                    ],
                  }))
                }
              >
                + Item
              </Button>
            </div>
            {form.items.map((item, idx) => (
              <div
                key={idx}
                className="grid gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 sm:grid-cols-4"
              >
                <Select
                  className="sm:col-span-2"
                  value={item.productId}
                  onChange={(e) => {
                    const prod = products.find((p) => p.id === e.target.value);
                    setForm((f) => {
                      const items = [...f.items];
                      items[idx] = {
                        ...items[idx],
                        productId: e.target.value,
                        unitCost: String(prod?.costPrice ?? 0),
                      };
                      return { ...f, items };
                    });
                  }}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.internalCode} — {p.name}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  placeholder="Qtd"
                  value={item.quantity}
                  onChange={(e) =>
                    setForm((f) => {
                      const items = [...f.items];
                      items[idx] = { ...items[idx], quantity: e.target.value };
                      return { ...f, items };
                    })
                  }
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Custo"
                  value={item.unitCost}
                  onChange={(e) =>
                    setForm((f) => {
                      const items = [...f.items];
                      items[idx] = { ...items[idx], unitCost: e.target.value };
                      return { ...f, items };
                    })
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex justify-between text-sm">
            <span>Total produtos: {formatBRL(formTotals.productsTotal)}</span>
            <span className="font-semibold">
              Total geral: {formatBRL(formTotals.grand)}
            </span>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar rascunho</Button>
          </div>
        </form>
      </Dialog>

      {/* Detail dialog */}
      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `Pedido PC-${detail.number}` : "Pedido"}
        description={detail ? detail.supplier.legalName : undefined}
        className="sm:max-w-3xl"
      >
        {detail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusVariant[detail.status] || "muted"}>
                {detail.status}
              </Badge>
              <span className="text-sm text-zinc-500">
                Total {formatBRL(detail.grandTotal)} · Resp. {detail.user.name}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {detail.status === "DRAFT" ? (
                <>
                  <Button size="sm" variant="secondary" onClick={() => statusAction("submit_approval")}>
                    Enviar p/ aprovação
                  </Button>
                  <Button size="sm" onClick={() => statusAction("approve")}>
                    <Check className="h-4 w-4" />
                    Aprovar
                  </Button>
                </>
              ) : null}
              {detail.status === "AWAITING_APPROVAL" ? (
                <Button size="sm" onClick={() => statusAction("approve")}>
                  <Check className="h-4 w-4" />
                  Aprovar
                </Button>
              ) : null}
              {detail.status === "APPROVED" ? (
                <Button size="sm" onClick={() => statusAction("send")}>
                  <Send className="h-4 w-4" />
                  Marcar enviado
                </Button>
              ) : null}
              {detail.receivable ? (
                <Button size="sm" onClick={openReceive}>
                  <PackageCheck className="h-4 w-4" />
                  Receber
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={printOrder}>
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
              {!["RECEIVED", "CANCELLED", "PARTIALLY_RECEIVED"].includes(
                detail.status,
              ) ? (
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

            <Table>
              <THead>
                <TR>
                  <TH>Produto</TH>
                  <TH>Qtd</TH>
                  <TH>Custo</TH>
                  <TH>Total</TH>
                  <TH>Recebido</TH>
                  <TH>Pendente</TH>
                </TR>
              </THead>
              <TBody>
                {detail.items.map((i) => (
                  <TR key={i.id}>
                    <TD>
                      <div className="font-medium">{i.product.name}</div>
                      <div className="text-xs text-zinc-500">
                        {i.product.internalCode}
                        {i.product.trackExpiry ? " · validade" : ""}
                      </div>
                    </TD>
                    <TD>{i.quantity}</TD>
                    <TD>{formatBRL(i.unitCost)}</TD>
                    <TD>{formatBRL(i.total)}</TD>
                    <TD>{i.qtyReceived}</TD>
                    <TD>{i.qtyPending}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            {detail.receipts.length ? (
              <div>
                <p className="mb-1 text-sm font-medium">Recebimentos</p>
                <ul className="text-sm text-zinc-600 dark:text-zinc-400">
                  {detail.receipts.map((r) => (
                    <li key={r.id}>
                      {formatDateBR(r.receivedAt)} · {r.user.name}
                      {r.notes ? ` · ${r.notes}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      {/* Receive dialog */}
      <Dialog
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Recebimento de compra"
        description="Informe quantidades, lotes e validades. Atualiza estoque e custo."
        className="sm:max-w-3xl"
      >
        <form onSubmit={submitReceive} className="space-y-4">
          {detail?.items
            .filter((i) => i.qtyPending > 0)
            .map((item) => {
              const line = receiveLines[item.id];
              if (!line) return null;
              return (
                <div
                  key={item.id}
                  className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <p className="text-sm font-medium">
                    {item.product.internalCode} — {item.product.name}
                    <span className="ml-2 text-xs font-normal text-zinc-500">
                      pendente {item.qtyPending}
                    </span>
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Qtd recebida</Label>
                      <Input
                        type="number"
                        min="0.0001"
                        max={item.qtyPending}
                        step="0.0001"
                        value={line.quantity}
                        onChange={(e) =>
                          setReceiveLines((m) => ({
                            ...m,
                            [item.id]: { ...m[item.id], quantity: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Custo unitário</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitCost}
                        onChange={(e) =>
                          setReceiveLines((m) => ({
                            ...m,
                            [item.id]: { ...m[item.id], unitCost: e.target.value },
                          }))
                        }
                      />
                    </div>
                    {item.product.trackExpiry ? (
                      <>
                        <div className="space-y-1">
                          <Label>Lote *</Label>
                          <Input
                            required
                            value={line.batchCode}
                            onChange={(e) =>
                              setReceiveLines((m) => ({
                                ...m,
                                [item.id]: {
                                  ...m[item.id],
                                  batchCode: e.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Validade</Label>
                          <Input
                            type="date"
                            value={line.expiresAt}
                            onChange={(e) =>
                              setReceiveLines((m) => ({
                                ...m,
                                [item.id]: {
                                  ...m[item.id],
                                  expiresAt: e.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                      </>
                    ) : null}
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Divergências / obs.</Label>
                      <Input
                        value={line.divergenceNotes}
                        onChange={(e) =>
                          setReceiveLines((m) => ({
                            ...m,
                            [item.id]: {
                              ...m[item.id],
                              divergenceNotes: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReceiveOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">Confirmar recebimento</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
