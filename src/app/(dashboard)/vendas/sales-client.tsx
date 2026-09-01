"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL, roundMoney } from "@/lib/money";
import { formatDateTimeBR } from "@/lib/date";
import {
  Search,
  Trash2,
  Eye,
  XCircle,
  Printer,
  ShoppingCart,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  internalCode: string;
  barcode: string | null;
  salePrice: number;
  currentStock: number;
  trackExpiry: boolean;
  categoryId: string | null;
};

type Customer = { id: string; name: string };
type PaymentMethod = {
  id: string;
  code: string;
  name: string;
  allowsInstallments: boolean;
};

type CartItem = {
  productId: string;
  name: string;
  code: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  stock: number;
};

type SaleListItem = {
  id: string;
  number: number;
  status: string;
  channel: string;
  saleDate: string;
  total: number;
  customer: { name: string } | null;
  seller: { name: string } | null;
  itemCount: number;
};

const statusVariant: Record<
  string,
  "default" | "success" | "warning" | "danger" | "muted"
> = {
  DRAFT: "muted",
  QUOTE: "warning",
  COMPLETED: "success",
  CANCELLED: "danger",
  AWAITING_PAYMENT: "warning",
};

export function SalesClient() {
  const [orders, setOrders] = useState<SaleListItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [status, setStatus] = useState("all");

  const [posOpen, setPosOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [channel, setChannel] = useState("STORE");
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [freight, setFreight] = useState("0");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  async function loadOrders() {
    const p = new URLSearchParams({ pageSize: "40", status });
    const res = await fetch(`/api/sales?${p}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro ao listar vendas");
      return;
    }
    setOrders(data.items);
  }

  async function loadMeta() {
    const [pRes, cRes, mRes] = await Promise.all([
      fetch("/api/products?pageSize=100&active=true"),
      fetch("/api/customers?pageSize=100&active=true"),
      fetch("/api/payment-methods"),
    ]);
    const pData = await pRes.json();
    const cData = await cRes.json();
    const mData = await mRes.json();
    if (pRes.ok) setProducts(pData.items);
    if (cRes.ok) setCustomers(cData.items);
    if (mRes.ok) {
      setMethods(mData);
      if (mData[0]) setPaymentMethodId(mData[0].id);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => void loadMeta(), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void loadOrders(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filteredProducts = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return products.slice(0, 8);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.internalCode.toLowerCase().includes(s) ||
          (p.barcode || "").includes(s),
      )
      .slice(0, 12);
  }, [products, search]);

  const totals = useMemo(() => {
    const subtotal = roundMoney(
      cart.reduce((s, i) => s + i.quantity * i.unitPrice - i.discount, 0),
    );
    const disc = roundMoney(Number(orderDiscount) || 0) + couponDiscount;
    const fr = roundMoney(Number(freight) || 0);
    const total = roundMoney(Math.max(0, subtotal - disc + fr));
    return { subtotal, disc, fr, total };
  }, [cart, orderDiscount, freight, couponDiscount]);

  const change = useMemo(() => {
    const received = Number(amountReceived) || 0;
    return roundMoney(Math.max(0, received - totals.total));
  }, [amountReceived, totals.total]);

  function addProduct(p: Product) {
    if (p.currentStock <= 0) {
      toast.error("Produto sem estoque");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        if (existing.quantity + 1 > p.currentStock) {
          toast.error("Estoque insuficiente");
          return prev;
        }
        return prev.map((i) =>
          i.productId === p.id
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          code: p.internalCode,
          quantity: 1,
          unitPrice: p.salePrice,
          discount: 0,
          stock: p.currentStock,
        },
      ];
    });
    setSearch("");
  }

  async function applyCoupon() {
    if (!couponCode.trim()) {
      setCouponDiscount(0);
      return;
    }
    const res = await fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: couponCode,
        orderSubtotal: totals.subtotal,
        channel,
        customerId: customerId || null,
        productIds: cart.map((c) => c.productId),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCouponDiscount(0);
      toast.error(data.error || "Cupom inválido");
      return;
    }
    setCouponDiscount(data.discountAmount);
    toast.success(`Cupom ${data.code}: -${formatBRL(data.discountAmount)}`);
  }

  async function checkout(intent: "confirm" | "quote" | "draft") {
    if (!cart.length) {
      toast.error("Carrinho vazio");
      return;
    }
    setSaving(true);
    try {
      const payments =
        intent === "confirm"
          ? [
              {
                paymentMethodId,
                amount: totals.total,
                amountReceived: Number(amountReceived) || totals.total,
                changeAmount: change,
                feeAmount: 0,
                installments: 1,
                status: "PAID" as const,
              },
            ]
          : [];

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customerId || null,
          channel,
          orderDiscount: Number(orderDiscount) || 0,
          freight: Number(freight) || 0,
          surcharge: 0,
          couponCode: couponCode || null,
          intent,
          items: cart.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discount: i.discount,
          })),
          payments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha na venda");
      toast.success(
        intent === "confirm"
          ? `Venda PV-${data.number} finalizada`
          : `Orçamento/rascunho PV-${data.number} salvo`,
      );
      setPosOpen(false);
      setCart([]);
      setOrderDiscount("0");
      setFreight("0");
      setCouponCode("");
      setCouponDiscount(0);
      setAmountReceived("");
      setCustomerId("");
      await loadOrders();
      await loadMeta();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/sales/${id}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    setDetail(data);
  }

  async function cancelSale() {
    if (!detail) return;
    const reason = prompt("Motivo do cancelamento:");
    if (!reason || reason.trim().length < 3) return;
    const res = await fetch(`/api/sales/${detail.id as string}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro ao cancelar");
      return;
    }
    toast.success("Venda cancelada e estoque estornado");
    setDetail(data);
    await loadOrders();
    await loadMeta();
  }

  function openPos() {
    setPosOpen(true);
    setAmountReceived("");
  }

  useEffect(() => {
    if (posOpen) {
      setAmountReceived(String(totals.total));
    }
  }, [posOpen, totals.total]);

  return (
    <div>
      <PageHeader
        title="Vendas"
        description="PDV com busca por código/barras, FEFO, cupons e cancelamento com estorno."
        actions={
          <Button size="sm" onClick={openPos}>
            <ShoppingCart className="h-4 w-4" />
            Nova venda
          </Button>
        }
      />

      <div className="mb-4 flex gap-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Todos</option>
          <option value="COMPLETED">Finalizadas</option>
          <option value="QUOTE">Orçamentos</option>
          <option value="DRAFT">Rascunhos</option>
          <option value="CANCELLED">Canceladas</option>
        </Select>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Nº</TH>
            <TH>Cliente</TH>
            <TH>Canal</TH>
            <TH>Status</TH>
            <TH>Data</TH>
            <TH>Total</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {!orders.length ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-zinc-500">
                Nenhuma venda
              </TD>
            </TR>
          ) : (
            orders.map((o) => (
              <TR key={o.id}>
                <TD className="font-mono">PV-{o.number}</TD>
                <TD>{o.customer?.name || "Consumidor"}</TD>
                <TD>
                  <Badge variant="muted">{o.channel}</Badge>
                </TD>
                <TD>
                  <Badge variant={statusVariant[o.status] || "muted"}>
                    {o.status}
                  </Badge>
                </TD>
                <TD className="text-xs">{formatDateTimeBR(o.saleDate)}</TD>
                <TD>{formatBRL(o.total)}</TD>
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

      {/* POS */}
      <Dialog
        open={posOpen}
        onClose={() => setPosOpen(false)}
        title="Nova venda / PDV"
        description="Cliente opcional. Estoque baixado na finalização."
        className="sm:max-w-4xl"
      >
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                className="pl-9"
                placeholder="Nome, código interno ou código de barras"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredProducts[0]) {
                    e.preventDefault();
                    addProduct(filteredProducts[0]);
                  }
                }}
              />
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="flex w-full items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-left text-sm hover:bg-orange-50 dark:border-zinc-800 dark:hover:bg-orange-950/30"
                >
                  <span>
                    <span className="font-mono text-xs text-zinc-500">
                      {p.internalCode}
                    </span>{" "}
                    {p.name}
                    <span className="ml-2 text-xs text-zinc-500">
                      est. {p.currentStock}
                    </span>
                  </span>
                  <span className="font-medium">{formatBRL(p.salePrice)}</span>
                </button>
              ))}
            </div>

            <Table>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH>Qtd</TH>
                  <TH>Preço</TH>
                  <TH>Total</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {!cart.length ? (
                  <TR>
                    <TD colSpan={5} className="py-6 text-center text-zinc-500">
                      Carrinho vazio
                    </TD>
                  </TR>
                ) : (
                  cart.map((item) => (
                    <TR key={item.productId}>
                      <TD>
                        <div className="text-sm font-medium">{item.name}</div>
                        <div className="text-xs text-zinc-500">{item.code}</div>
                      </TD>
                      <TD>
                        <Input
                          type="number"
                          min="0.0001"
                          max={item.stock}
                          step="1"
                          className="w-20"
                          value={item.quantity}
                          onChange={(e) => {
                            const q = Number(e.target.value);
                            setCart((prev) =>
                              prev.map((i) =>
                                i.productId === item.productId
                                  ? {
                                      ...i,
                                      quantity: Math.min(
                                        Math.max(q, 0.0001),
                                        i.stock,
                                      ),
                                    }
                                  : i,
                              ),
                            );
                          }}
                        />
                      </TD>
                      <TD>{formatBRL(item.unitPrice)}</TD>
                      <TD>
                        {formatBRL(
                          item.quantity * item.unitPrice - item.discount,
                        )}
                      </TD>
                      <TD>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setCart((prev) =>
                              prev.filter(
                                (i) => i.productId !== item.productId,
                              ),
                            )
                          }
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

          <div className="space-y-3 lg:col-span-2">
            <div className="space-y-2">
              <Label>Cliente (opcional)</Label>
              <Select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Consumidor não identificado</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Canal</Label>
              <Select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="STORE">Loja física</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="SITE">Site</option>
                <option value="OTHER">Outro</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Desconto R$</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={orderDiscount}
                  onChange={(e) => setOrderDiscount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Frete</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={freight}
                  onChange={(e) => setFreight(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Cupom"
                value={couponCode}
                onChange={(e) =>
                  setCouponCode(e.target.value.toUpperCase())
                }
              />
              <Button type="button" variant="outline" onClick={applyCoupon}>
                Aplicar
              </Button>
            </div>
            {couponDiscount > 0 ? (
              <p className="text-xs text-emerald-600">
                Cupom: -{formatBRL(couponDiscount)}
              </p>
            ) : null}

            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
              >
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor recebido</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
              />
              <p className="text-xs text-zinc-500">
                Troco: {formatBRL(change)}
              </p>
            </div>

            <Card>
              <CardContent className="space-y-1 pt-4 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatBRL(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Descontos</span>
                  <span>-{formatBRL(totals.disc)}</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Frete</span>
                  <span>{formatBRL(totals.fr)}</span>
                </div>
                <div className="flex justify-between border-t border-zinc-100 pt-2 text-base font-semibold dark:border-zinc-800">
                  <span>Total</span>
                  <span>{formatBRL(totals.total)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-2">
              <Button
                disabled={saving || !cart.length}
                onClick={() => checkout("confirm")}
              >
                {saving ? "Processando..." : "Finalizar venda"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  disabled={saving || !cart.length}
                  onClick={() => checkout("quote")}
                >
                  Orçamento
                </Button>
                <Button
                  variant="outline"
                  disabled={saving || !cart.length}
                  onClick={() => checkout("draft")}
                >
                  Rascunho
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Detail */}
      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={
          detail
            ? `Venda PV-${String((detail as { number: number }).number)}`
            : "Venda"
        }
        className="sm:max-w-2xl"
      >
        {detail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  statusVariant[String(detail.status)] || "muted"
                }
              >
                {String(detail.status)}
              </Badge>
              <span className="text-sm">
                {formatBRL(detail.total as number)} ·{" "}
                {String(detail.channel)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  window.open(
                    `/api/sales/${detail.id as string}/print`,
                    "_blank",
                  )
                }
              >
                <Printer className="h-4 w-4" />
                Comprovante
              </Button>
              {detail.status !== "CANCELLED" ? (
                <Button size="sm" variant="danger" onClick={cancelSale}>
                  <XCircle className="h-4 w-4" />
                  Cancelar / estornar
                </Button>
              ) : null}
            </div>
            <ul className="space-y-1 text-sm">
              {(
                detail.items as Array<{
                  id: string;
                  quantity: number;
                  total: number;
                  product: { name: string; internalCode: string };
                  batch?: { code: string } | null;
                }>
              )?.map((i) => (
                <li
                  key={i.id}
                  className="flex justify-between rounded border border-zinc-100 px-2 py-1 dark:border-zinc-800"
                >
                  <span>
                    {i.product.internalCode} {i.product.name} x{i.quantity}
                    {i.batch ? (
                      <span className="text-xs text-zinc-500">
                        {" "}
                        · lote {i.batch.code}
                      </span>
                    ) : null}
                  </span>
                  <span>{formatBRL(i.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
