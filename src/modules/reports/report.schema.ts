import { z } from "zod";

export const periodQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  compare: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((v) => v === "true"),
});

export const rankingsQuerySchema = periodQuerySchema.extend({
  limit: z.coerce.number().int().min(5).max(50).default(10),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  channel: z.string().optional(),
  sellerId: z.string().optional(),
});

export const reportTypeSchema = z.enum([
  "stock_current",
  "stock_low",
  "stock_out",
  "stock_movements",
  "expiring",
  "expired",
  "purchases_period",
  "sales_period",
  "sales_by_product",
  "sales_by_category",
  "sales_by_customer",
  "sales_by_seller",
  "sales_by_channel",
  "margin_by_product",
  "customers_inactive",
  "birthdays",
  "coupon_usage",
  "campaigns",
]);

export const reportQuerySchema = periodQuerySchema.extend({
  type: reportTypeSchema,
  format: z.enum(["json", "csv"]).optional().default("json"),
  daysInactive: z.coerce.number().int().min(1).default(30),
  daysToExpiry: z.coerce.number().int().min(1).max(365).default(30),
});

export type PeriodQuery = z.infer<typeof periodQuerySchema>;
export type RankingsQuery = z.infer<typeof rankingsQuerySchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
