import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../src/lib/prisma";
import {
  requestPasswordReset,
  confirmPasswordReset,
  changeOwnPassword,
} from "../../src/modules/users/user.service";
import { verifyPassword } from "../../src/lib/auth";

describe("password reset and change", () => {
  let userId = "";
  let email = "";
  const seededPassword = process.env.SEED_SELLER_PASSWORD!;

  beforeAll(async () => {
    const user = await prisma.user.findFirst({
      where: { email: "seller@example.test", active: true },
    });
    if (!user) throw new Error("Seed vendedor ausente");
    userId = user.id;
    email = user.email;
  });

  it("resets password via token flow", async () => {
    const req = await requestPasswordReset(email);
    expect(req.token).toBeTruthy();

    await confirmPasswordReset(req.token!, "NovaSenha@123");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await verifyPassword("NovaSenha@123", user.passwordHash);
    expect(ok).toBe(true);

    // change back for other tests / login demo
    await changeOwnPassword(userId, "NovaSenha@123", seededPassword);
    const again = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword(seededPassword, again.passwordHash)).toBe(true);
  });

  it("rejects invalid token", async () => {
    await expect(
      confirmPasswordReset("token-invalido-sem-hash-real-xxxxxxxx", "x"),
    ).rejects.toThrow(/inválido|expirado/i);
  });
});
