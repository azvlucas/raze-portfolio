import { z } from "zod";

export const segmentFiltersSchema = z.object({
  lastPurchaseDaysMin: z.coerce.number().int().min(0).optional(),
  lastPurchaseDaysMax: z.coerce.number().int().min(0).optional(),
  minOrders: z.coerce.number().int().min(0).optional(),
  maxOrders: z.coerce.number().int().min(0).optional(),
  minTotalSpent: z.coerce.number().min(0).optional(),
  maxTotalSpent: z.coerce.number().min(0).optional(),
  minTicket: z.coerce.number().min(0).optional(),
  maxTicket: z.coerce.number().min(0).optional(),
  productId: z.string().optional(),
  categoryId: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  origin: z.string().optional(),
  channel: z.string().optional(),
  tag: z.string().optional(),
  birthdayMonth: z.coerce.number().int().min(1).max(12).optional(),
  petBirthdayMonth: z.coerce.number().int().min(1).max(12).optional(),
  marketingConsentOnly: z.boolean().optional(),
  onlyOnce: z.boolean().optional(),
  recurring: z.boolean().optional(), // orders >= 2
  newCustomersDays: z.coerce.number().int().min(1).optional(),
});

export const segmentQuerySchema = segmentFiltersSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  quick: z
    .enum([
      "all",
      "new",
      "recurring",
      "once",
      "inactive_30",
      "inactive_60",
      "inactive_90",
      "top_revenue",
      "top_frequency",
      "birthday_month",
      "pet_birthday_month",
    ])
    .optional()
    .default("all"),
  sortBy: z
    .enum(["name", "totalSpent", "orderCount", "lastPurchase", "ticketAvg"])
    .optional()
    .default("totalSpent"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const campaignSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  segmentKey: z.string().optional().nullable(),
  segmentFilters: segmentFiltersSchema.optional().nullable(),
  channel: z.enum(["WHATSAPP", "EMAIL", "INSTAGRAM", "OTHER"]),
  message: z.string().trim().max(4000).optional().nullable(),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  couponId: z.string().optional().nullable(),
  /** snapshot customer ids; if empty, resolve from filters */
  customerIds: z.array(z.string()).optional(),
  status: z
    .enum(["DRAFT", "READY", "RUNNING", "COMPLETED", "CANCELLED"])
    .optional()
    .default("DRAFT"),
});

export const campaignListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional().default("all"),
  search: z.string().optional().default(""),
});

export type SegmentFilters = z.infer<typeof segmentFiltersSchema>;
export type SegmentQuery = z.infer<typeof segmentQuerySchema>;
export type CampaignInput = z.infer<typeof campaignSchema>;
