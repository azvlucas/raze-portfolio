import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { writeAuditLog } from "@/modules/audit/audit.service";
import type { UserCreateInput, UserUpdateInput } from "./user.schema";

export async function listUsers(companyId: string) {
  const users = await prisma.user.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      role: { select: { id: true, code: true, name: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    active: u.active,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    role: u.role,
  }));
}

export async function listRoles() {
  return prisma.role.findMany({
    orderBy: { name: "asc" },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
  });
}

export async function createUser(
  companyId: string,
  actorId: string,
  input: UserCreateInput,
) {
  const exists = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
  });
  if (exists) throw new Error("Já existe usuário com este e-mail");

  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new Error("Perfil inválido");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      companyId,
      roleId: input.roleId,
      name: input.name.trim(),
      email: input.email,
      passwordHash,
      active: input.active ?? true,
    },
    include: { role: { select: { id: true, code: true, name: true } } },
  });

  await writeAuditLog({
    companyId,
    userId: actorId,
    action: "CREATE",
    entityType: "User",
    entityId: user.id,
    after: { email: user.email, role: role.code },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    active: user.active,
    role: user.role,
  };
}

export async function updateUser(
  companyId: string,
  actorId: string,
  id: string,
  input: UserUpdateInput,
) {
  const current = await prisma.user.findFirst({
    where: { id, companyId, deletedAt: null },
  });
  if (!current) throw new Error("Usuário não encontrado");

  if (input.email !== current.email) {
    const dup = await prisma.user.findFirst({
      where: { email: input.email, deletedAt: null, NOT: { id } },
    });
    if (dup) throw new Error("E-mail já em uso");
  }

  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new Error("Perfil inválido");

  const data: {
    name: string;
    email: string;
    roleId: string;
    active: boolean;
    passwordHash?: string;
  } = {
    name: input.name.trim(),
    email: input.email,
    roleId: input.roleId,
    active: input.active ?? true,
  };

  if (input.password) {
    data.passwordHash = await hashPassword(input.password);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    include: { role: { select: { id: true, code: true, name: true } } },
  });

  await writeAuditLog({
    companyId,
    userId: actorId,
    action: "UPDATE",
    entityType: "User",
    entityId: id,
    before: {
      email: current.email,
      roleId: current.roleId,
      active: current.active,
    },
    after: {
      email: updated.email,
      roleId: updated.roleId,
      active: updated.active,
      passwordChanged: !!input.password,
    },
  });

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    active: updated.active,
    role: updated.role,
  };
}

export async function deactivateUser(
  companyId: string,
  actorId: string,
  id: string,
) {
  if (actorId === id) {
    throw new Error("Você não pode inativar o próprio usuário");
  }
  const current = await prisma.user.findFirst({
    where: { id, companyId, deletedAt: null },
  });
  if (!current) throw new Error("Usuário não encontrado");

  await prisma.user.update({
    where: { id },
    data: { active: false },
  });

  await writeAuditLog({
    companyId,
    userId: actorId,
    action: "DEACTIVATE",
    entityType: "User",
    entityId: id,
  });

  return { ok: true };
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, active: true },
  });
  if (!user) throw new Error("Usuário não encontrado");

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new Error("Senha atual incorreta");

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await writeAuditLog({
    companyId: user.companyId,
    userId,
    action: "PASSWORD_CHANGE",
    entityType: "User",
    entityId: userId,
  });

  return { ok: true };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Request password reset — returns token only in non-production for MVP */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      deletedAt: null,
      active: true,
    },
  });

  // Always return generic message to avoid user enumeration
  const generic = {
    message:
      "Se o e-mail existir, um link de redefinição estará disponível (MVP: token retornado apenas em desenvolvimento).",
  };

  if (!user) return { ...generic, token: null as string | null };

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  await writeAuditLog({
    companyId: user.companyId,
    userId: user.id,
    action: "PASSWORD_RESET_REQUEST",
    entityType: "User",
    entityId: user.id,
  });

  const exposeToken = process.env.NODE_ENV !== "production";
  return {
    ...generic,
    token: exposeToken ? token : null,
    expiresAt: exposeToken ? expiresAt.toISOString() : undefined,
  };
}

export async function confirmPasswordReset(token: string, newPassword: string) {
  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!record || !record.user.active) {
    throw new Error("Token inválido ou expirado");
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    // invalidate other tokens
    await tx.passwordResetToken.updateMany({
      where: {
        userId: record.userId,
        usedAt: null,
        NOT: { id: record.id },
      },
      data: { usedAt: new Date() },
    });
  });

  await writeAuditLog({
    companyId: record.user.companyId,
    userId: record.userId,
    action: "PASSWORD_RESET_CONFIRM",
    entityType: "User",
    entityId: record.userId,
  });

  return { ok: true };
}

export async function getSettings(companyId: string) {
  const rows = await prisma.setting.findMany({ where: { companyId } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    days_to_expiry_alert: Number(map.days_to_expiry_alert ?? 30),
    max_discount_percent_seller: Number(map.max_discount_percent_seller ?? 5),
    max_discount_percent_manager: Number(
      map.max_discount_percent_manager ?? 20,
    ),
    company_timezone: map.company_timezone ?? "America/Sao_Paulo",
  };
}

export async function updateSettings(
  companyId: string,
  userId: string,
  input: Record<string, number | undefined>,
) {
  const keys = [
    "days_to_expiry_alert",
    "max_discount_percent_seller",
    "max_discount_percent_manager",
  ] as const;

  for (const key of keys) {
    const value = input[key];
    if (value === undefined) continue;
    await prisma.setting.upsert({
      where: { companyId_key: { companyId, key } },
      update: { value: String(value) },
      create: { companyId, key, value: String(value) },
    });
  }

  await writeAuditLog({
    companyId,
    userId,
    action: "UPDATE",
    entityType: "Setting",
    after: input,
  });

  return getSettings(companyId);
}
