import { z } from "zod";

const money = z.coerce.number().min(0, "Valor não pode ser negativo");
const qty = z.coerce.number().min(0, "Quantidade não pode ser negativa");

export const petSizeSchema = z.enum(["SMALL", "MEDIUM", "LARGE"]);

export const productCreateSchema = z.object({
  /** Opcional: gerado automaticamente (primeiro livre) se omitido. Usado na importação CSV. */
  internalCode: z.string().trim().max(50).optional().nullable(),
  barcode: z.string().trim().max(50).optional().nullable(),
  name: z.string().trim().min(2, "Nome obrigatório").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  unitId: z.string().min(1, "Unidade obrigatória"),
  costPrice: money.default(0),
  /** Markup sobre o custo (%). Se informado com custo, o front calcula o preço de venda. */
  markupPercent: z.coerce.number().min(0).max(10000).default(0),
  salePrice: money.default(0),
  minStock: qty.default(0),
  location: z.string().trim().max(100).optional().nullable(),
  trackExpiry: z.boolean().default(false),
  /** Portes: pequeno, médio e/ou grande (até os 3). */
  petSizes: z.array(petSizeSchema).default([]),
  imageUrl: z.string().url().optional().nullable().or(z.literal("")),
  active: z.boolean().default(true),
});

export const productUpdateSchema = productCreateSchema
  .omit({ internalCode: true })
  .partial()
  .extend({
    priceChangeReason: z.string().trim().max(300).optional().nullable(),
  });

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional().default(""),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  supplierId: z.string().optional(),
  /** Filtra produtos que atendem este porte (has). */
  petSize: petSizeSchema.optional(),
  active: z
    .enum(["true", "false", "all"])
    .optional()
    .default("all"),
  stock: z
    .enum(["all", "out", "low", "ok"])
    .optional()
    .default("all"),
  sortBy: z
    .enum(["name", "internalCode", "salePrice", "costPrice", "currentStock", "createdAt"])
    .optional()
    .default("name"),
  sortDir: z.enum(["asc", "desc"]).optional().default("asc"),
});

export const bulkPriceChangeSchema = z.object({
  productIds: z.array(z.string()).min(1),
  percent: z.coerce.number().refine((v) => v !== 0, "Percentual não pode ser zero"),
  field: z.enum(["salePrice", "costPrice"]).default("salePrice"),
  reason: z.string().trim().max(300).optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().default(true),
});

export const brandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  active: z.boolean().default(true),
});

export const unitSchema = z.object({
  code: z.string().trim().min(1).max(10).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(80),
  active: z.boolean().default(true),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
