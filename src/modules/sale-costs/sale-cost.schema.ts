import { z } from "zod";

export const saleCostSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  type: z.enum(["FIXED", "PERCENT"]),
  value: z.coerce.number().min(0),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export type SaleCostInput = z.infer<typeof saleCostSchema>;
