import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().trim().min(2).max(200),
  document: z.string().trim().max(30).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  email: z
    .string()
    .trim()
    .email("E-mail inválido")
    .optional()
    .nullable()
    .or(z.literal("")),
  birthDate: z.string().optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(2).optional().nullable(),
  origin: z
    .enum([
      "SITE",
      "WHATSAPP",
      "INSTAGRAM",
      "STORE",
      "REFERRAL",
      "CAMPAIGN",
      "OTHER",
    ])
    .default("OTHER"),
  notes: z.string().trim().max(2000).optional().nullable(),
  marketingConsent: z.boolean().default(false),
  active: z.boolean().default(true),
  tags: z.array(z.string()).optional().default([]),
});

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional().default(""),
  active: z.enum(["true", "false", "all"]).optional().default("all"),
  origin: z.string().optional(),
});

export const petSchema = z.object({
  name: z.string().trim().min(1).max(100),
  species: z.enum(["DOG", "CAT", "BIRD", "OTHER"]).default("DOG"),
  breed: z.string().trim().max(100).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().default(true),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type PetInput = z.infer<typeof petSchema>;
