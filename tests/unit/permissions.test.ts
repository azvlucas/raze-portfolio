import { describe, it, expect } from "vitest";
import {
  hasPermission,
  PERMISSIONS,
  ROLE_PERMISSION_MAP,
  ROLE_CODES,
} from "../../src/lib/permissions";

describe("permissions", () => {
  it("admin has all mapped checks", () => {
    const perms = ROLE_PERMISSION_MAP[ROLE_CODES.ADMIN];
    expect(hasPermission(perms, PERMISSIONS.USERS_MANAGE)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.STOCK_ADJUST)).toBe(true);
  });

  it("seller cannot manage users", () => {
    const perms = ROLE_PERMISSION_MAP[ROLE_CODES.SELLER];
    expect(hasPermission(perms, PERMISSIONS.SALES_CREATE)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.USERS_MANAGE)).toBe(false);
  });

  it("stockkeeper can adjust stock but not sell", () => {
    const perms = ROLE_PERMISSION_MAP[ROLE_CODES.STOCKKEEPER];
    expect(hasPermission(perms, PERMISSIONS.STOCK_ADJUST)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.SALES_CREATE)).toBe(false);
  });
});
