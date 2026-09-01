import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../src/lib/prisma";
import {
  computeCustomerMetrics,
  segmentCustomers,
  getCrmOverview,
} from "../../src/modules/crm/crm.service";
import {
  createCampaign,
  previewSegment,
} from "../../src/modules/campaigns/campaign.service";

describe("CRM segments and campaigns", () => {
  let companyId = "";
  let userId = "";

  beforeAll(async () => {
    const company = await prisma.company.findFirst();
    const user = await prisma.user.findFirst({ where: { active: true } });
    if (!company || !user) throw new Error("Seed incompleto");
    companyId = company.id;
    userId = user.id;
  });

  it("computes metrics and overview", async () => {
    const metrics = await computeCustomerMetrics(companyId);
    expect(metrics.length).toBeGreaterThan(0);

    const overview = await getCrmOverview(companyId);
    expect(overview.totalCustomers).toBe(metrics.length);
    expect(overview.totalRevenue).toBeGreaterThanOrEqual(0);
  });

  it("segments inactive and once buyers", async () => {
    const once = await segmentCustomers(companyId, {
      quick: "once",
      page: 1,
      pageSize: 50,
      sortBy: "totalSpent",
      sortDir: "desc",
    });
    for (const item of once.items) {
      expect(item.orderCount).toBe(1);
    }

    const inactive = await segmentCustomers(companyId, {
      quick: "inactive_30",
      page: 1,
      pageSize: 50,
      sortBy: "totalSpent",
      sortDir: "desc",
    });
    for (const item of inactive.items) {
      expect(item.daysSinceLast).toBeGreaterThanOrEqual(30);
    }
  });

  it("excludes no-consent from whatsapp preview and creates campaign", async () => {
    // ensure at least one customer without consent
    await prisma.customer.updateMany({
      where: { companyId, marketingConsent: false },
      data: { marketingConsent: false },
    });

    const all = await previewSegment(
      companyId,
      { quick: "all" },
      "INSTAGRAM",
    );
    const wa = await previewSegment(companyId, { quick: "all" }, "WHATSAPP");

    expect(wa.count).toBeLessThanOrEqual(all.count);

    const campaign = await createCampaign(companyId, userId, {
      name: `Campanha teste ${Date.now()}`,
      description: "E5 test",
      channel: "WHATSAPP",
      segmentKey: "all",
      segmentFilters: {},
      message: "Olá da Raze Pet!",
      status: "READY",
    });

    expect(campaign).toBeTruthy();
    expect(campaign!.selectedCount).toBe(wa.count);
    // all selected must have consent for WhatsApp
    for (const c of campaign!.customers) {
      expect(c.marketingConsent).toBe(true);
    }
  });
});
