import { z } from "zod";

export const supplierSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  tradeName: z.string().trim().max(200).optional().nullable(),
  document: z.string().trim().max(30).optional().nullable(),
  stateRegistration: z.string().trim().max(40).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  email: z
    .string()
    .trim()
    .email("E-mail inválido")
    .optional()
    .nullable()
    .or(z.literal("")),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(2).optional().nullable(),
  mainContact: z.string().trim().max(120).optional().nullable(),
  avgDeliveryDays: z.coerce.number().int().min(0).optional().nullable(),
  paymentTerms: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  active: z.boolean().default(true),
});

export const supplierListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional().default(""),
  active: z.enum(["true", "false", "all"]).optional().default("all"),
});

export const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  expectedDate: z.string().optional().nullable(),
  paymentTerms: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  discountTotal: z.coerce.number().min(0).default(0),
  freight: z.coerce.number().min(0).default(0),
  otherExpenses: z.coerce.number().min(0).default(0),
  items: z.array(purchaseItemSchema).min(1, "Informe ao menos um item"),
});

export const purchaseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional().default(""),
  status: z.string().optional().default("all"),
  supplierId: z.string().optional(),
});

export const purchaseStatusActionSchema = z.object({
  action: z.enum([
    "submit_approval",
    "approve",
    "send",
    "cancel",
  ]),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const receiptItemSchema = z.object({
  purchaseOrderItemId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
  batchCode: z.string().trim().max(80).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  divergenceNotes: z.string().trim().max(500).optional().nullable(),
});

export const receiptSchema = z.object({
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(receiptItemSchema).min(1),
});

export type SupplierInput = z.infer<typeof supplierSchema>;
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export type ReceiptInput = z.infer<typeof receiptSchema>;
