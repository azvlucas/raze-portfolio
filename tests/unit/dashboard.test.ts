import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { getStrategicDashboard } from "../../src/modules/reports/dashboard.service";
import { getRankings } from "../../src/modules/reports/rankings.service";
import { runReport } from "../../src/modules/reports/reports.service";

describe("dashboard rankings reports", () => {
  let companyId = "";

  beforeAll(async () => {
    const company = await prisma.company.findFirst();
    if (!company) throw new Error("Seed incompleto");
    companyId = company.id;
  });

  it("returns strategic KPIs and charts", async () => {
    const data = await getStrategicDashboard(companyId);
    expect(data.kpis).toBeDefined();
    expect(data.kpis.salesCount).toBeGreaterThanOrEqual(0);
    expect(data.charts.revenueByDay.length).toBeGreaterThan(0);
    expect(data.comparison).toBeTruthy();
  });

  it("returns rankings structures", async () => {
    const data = await getRankings(companyId, {
      limit: 5,
      compare: true,
    });
    expect(Array.isArray(data.productsByQty)).toBe(true);
    expect(Array.isArray(data.customersByRevenue)).toBe(true);
    expect(Array.isArray(data.channelsByRevenue)).toBe(true);
  });

  it("runs stock and sales reports with csv", async () => {
    const stock = await runReport(companyId, {
      type: "stock_current",
      format: "json",
      compare: false,
      daysInactive: 30,
      daysToExpiry: 30,
    });
    expect(stock.rows.length).toBeGreaterThan(0);
    expect(stock.csv).toContain("codigo");

    const sales = await runReport(companyId, {
      type: "sales_period",
      format: "json",
      compare: false,
      daysInactive: 30,
      daysToExpiry: 30,
    });
    expect(sales.title).toMatch(/Vendas/i);
    expect(sales.csv).toContain("numero");
  });
});
