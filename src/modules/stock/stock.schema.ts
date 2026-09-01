import { z } from "zod";

export const stockAdjustSchema = z.object({
  productId: z.string().min(1),
  batchId: z.string().optional().nullable(),
  quantity: z.coerce.number().positive("Quantidade deve ser maior que zero"),
  type: z.enum([
    "ADJUST_IN",
    "ADJUST_OUT",
    "LOSS",
    "DAMAGE",
    "EXPIRY",
  ]),
  reason: z.string().trim().min(3, "Justificativa obrigatória").max(500),
  // for ADJUST_IN on trackExpiry products without batch
  batchCode: z.string().trim().max(80).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

export const stockAdjustBySupplierItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive("Quantidade deve ser maior que zero"),
  type: z
    .enum(["ADJUST_IN", "ADJUST_OUT", "LOSS", "DAMAGE", "EXPIRY"])
    .default("ADJUST_IN"),
  batchId: z.string().optional().nullable(),
  batchCode: z.string().trim().max(80).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

export const stockAdjustBySupplierSchema = z.object({
  supplierId: z.string().min(1),
  reason: z.string().trim().min(3, "Justificativa obrigatória").max(500),
  items: z
    .array(stockAdjustBySupplierItemSchema)
    .min(1, "Informe ao menos um produto para ajustar"),
});

export const stockListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional().default(""),
  stock: z.enum(["all", "out", "low", "ok"]).optional().default("all"),
  expiry: z.enum(["all", "expiring", "expired"]).optional().default("all"),
});

export const batchListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  productId: z.string().optional(),
  search: z.string().optional().default(""),
  status: z.enum(["all", "available", "expiring", "expired", "empty"]).default("all"),
  daysToExpiry: z.coerce.number().int().min(1).max(365).optional(),
});

export const inventoryCreateSchema = z.object({
  notes: z.string().trim().max(500).optional().nullable(),
});

export const inventoryCountSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        batchId: z.string().optional().nullable(),
        countedQty: z.coerce.number().min(0),
      }),
    )
    .min(1),
});

export const expiryControlListQuerySchema = z.object({
  /** product = busca por produto; supplier = por fornecedor; with_stock = só com estoque */
  mode: z.enum(["product", "supplier", "with_stock"]).default("with_stock"),
  search: z.string().optional().default(""),
  supplierId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Adiciona novas datas de validade aos produtos (não substitui as existentes). */
export const expiryControlRegisterSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        expiresAt: z.string().min(1, "Informe a data de validade"),
        notes: z.string().trim().max(300).optional().nullable(),
      }),
    )
    .min(1, "Selecione ao menos um item"),
});

export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;
export type StockAdjustBySupplierInput = z.infer<
  typeof stockAdjustBySupplierSchema
>;
export type ExpiryControlListQuery = z.infer<
  typeof expiryControlListQuerySchema
>;
export type ExpiryControlRegisterInput = z.infer<
  typeof expiryControlRegisterSchema
>;
