import { z } from "zod";

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
  roleId: z.string().min(1),
  active: z.boolean().default(true),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  roleId: z.string().min(1),
  active: z.boolean().default(true),
  password: z
    .string()
    .min(8)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

export const resetPasswordRequestSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordConfirmSchema = z
  .object({
    token: z.string().min(20),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

export const settingsUpdateSchema = z.object({
  days_to_expiry_alert: z.coerce.number().int().min(1).max(365).optional(),
  max_discount_percent_seller: z.coerce.number().min(0).max(100).optional(),
  max_discount_percent_manager: z.coerce.number().min(0).max(100).optional(),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
