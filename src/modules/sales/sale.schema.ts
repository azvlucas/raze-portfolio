import { z } from "zod";

export const saleItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0),
});

export const salePaymentSchema = z.object({
  paymentMethodId: z.string().min(1),
  amount: z.coerce.number().positive(),
  amountReceived: z.coerce.number().min(0).optional().nullable(),
  changeAmount: z.coerce.number().min(0).optional().nullable(),
  feeAmount: z.coerce.number().min(0).default(0),
  installments: z.coerce.number().int().min(1).default(1),
  status: z.enum(["PENDING", "PARTIAL", "PAID", "CANCELLED"]).default("PAID"),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const saleOrderSchema = z.object({
  customerId: z.string().optional().nullable(),
  petId: z.string().optional().nullable(),
  channel: z
    .enum(["SITE", "WHATSAPP", "INSTAGRAM", "STORE", "OTHER"])
    .default("STORE"),
  notes: z.string().trim().max(2000).optional().nullable(),
  orderDiscount: z.coerce.number().min(0).default(0),
  surcharge: z.coerce.number().min(0).default(0),
  freight: z.coerce.number().min(0).default(0),
  couponCode: z.string().trim().max(40).optional().nullable(),
  items: z.array(saleItemSchema).min(1, "Informe ao menos um item"),
  payments: z.array(salePaymentSchema).optional().default([]),
  /** draft | quote | confirm (baixar estoque) */
  intent: z.enum(["draft", "quote", "confirm"]).default("confirm"),
});

export const saleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional().default(""),
  status: z.string().optional().default("all"),
  channel: z.string().optional(),
  customerId: z.string().optional(),
});

export const saleCancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const saleStatusSchema = z.object({
  action: z.enum(["confirm", "cancel", "to_sale"]),
  reason: z.string().trim().max(500).optional().nullable(),
});

export type SaleOrderInput = z.infer<typeof saleOrderSchema>;
