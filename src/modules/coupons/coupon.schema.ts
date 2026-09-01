import { z } from "zod";

export const couponSchema = z.object({
  code: z.string().trim().min(2).max(40).transform((v) => v.toUpperCase()),
  description: z.string().trim().max(300).optional().nullable(),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.coerce.number().positive(),
  minOrderValue: z.coerce.number().min(0).default(0),
  startsAt: z.string().min(1),
  endsAt: z.string().optional().nullable(),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
  maxUsesPerCustomer: z.coerce.number().int().positive().optional().nullable(),
  active: z.boolean().default(true),
  channels: z.array(z.string()).optional().default([]),
  productIds: z.array(z.string()).optional().default([]),
  categoryIds: z.array(z.string()).optional().default([]),
});

export const couponListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional().default(""),
  active: z.enum(["true", "false", "all"]).optional().default("all"),
});

export type CouponInput = z.infer<typeof couponSchema>;
