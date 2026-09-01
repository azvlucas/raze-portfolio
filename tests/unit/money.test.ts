import { describe, it, expect } from "vitest";
import {
  calcMarginPercent,
  formatBRL,
  markupFromPrices,
  roundMoney,
  salePriceFromMarkup,
  toNumber,
} from "../../src/lib/money";
import { computeSaleOverhead } from "../../src/modules/sale-costs/sale-cost.service";

describe("money helpers", () => {
  it("converts decimal-like values", () => {
    expect(toNumber("10.5")).toBe(10.5);
    expect(toNumber(null)).toBe(0);
  });

  it("formats BRL", () => {
    expect(formatBRL(16.9)).toMatch(/R\$/);
  });

  it("calculates margin", () => {
    expect(calcMarginPercent(8.5, 17)).toBeCloseTo(50, 0);
    expect(calcMarginPercent(10, 0)).toBe(0);
  });

  it("rounds money", () => {
    expect(roundMoney(10.005)).toBe(10.01);
  });

  it("calculates sale price from markup", () => {
    expect(salePriceFromMarkup(10, 100)).toBe(20);
    expect(markupFromPrices(10, 20)).toBe(100);
  });

  it("computes common sale overhead", () => {
    const costs = [
      { type: "FIXED", value: 2 },
      { type: "PERCENT", value: 10 },
    ];
    // sale 100 → 2 + 10 = 12
    expect(computeSaleOverhead(100, costs)).toBe(12);
  });
});
