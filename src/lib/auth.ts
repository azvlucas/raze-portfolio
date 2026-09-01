import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { PermissionCode } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  companyId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
};

export type SessionData = {
  user?: SessionUser;
  isLoggedIn: boolean;
};

function getSessionPassword(): string {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must contain at least 32 characters in production");
  }

  return "development-only-session-secret-32-chars";
}

const sessionOptions: SessionOptions = {
  password: getSessionPassword(),
  cookieName: "raze_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.user) {
    throw new AuthError("Não autenticado", 401);
  }
  return session.user;
}

export async function requirePermission(
  permission: PermissionCode | PermissionCode[],
): Promise<SessionUser> {
  const user = await requireSession();
  if (!hasPermission(user.permissions, permission)) {
    throw new AuthError("Sem permissão para esta ação", 403);
  }
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** In-memory rate limit for login (per process). Use a shared store when scaling horizontally. */
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(key: string, max = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }
  if (entry.count >= max) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { allowed: true, remaining: max - entry.count };
}

export function clearLoginRateLimit(key: string) {
  loginAttempts.delete(key);
}

export async function buildSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, active: true, deletedAt: null },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    companyId: user.companyId,
    roleId: user.roleId,
    roleCode: user.role.code,
    roleName: user.role.name,
    permissions: user.role.permissions.map((rp) => rp.permission.code),
  };
}

export async function loginWithCredentials(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const rateKey = `login:${normalized}`;
  const rate = checkLoginRateLimit(rateKey);
  if (!rate.allowed) {
    throw new AuthError(
      "Muitas tentativas de login. Tente novamente em alguns minutos.",
      429,
    );
  }

  const user = await prisma.user.findFirst({
    where: { email: normalized, deletedAt: null },
  });

  if (!user || !user.active) {
    throw new AuthError("E-mail ou senha inválidos", 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AuthError("E-mail ou senha inválidos", 401);
  }

  const sessionUser = await buildSessionUser(user.id);
  if (!sessionUser) {
    throw new AuthError("Usuário sem perfil válido", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  clearLoginRateLimit(rateKey);

  const session = await getSession();
  session.user = sessionUser;
  session.isLoggedIn = true;
  await session.save();

  return sessionUser;
}

export async function logout() {
  const session = await getSession();
  session.destroy();
}
