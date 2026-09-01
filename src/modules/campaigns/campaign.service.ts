import { prisma } from "@/lib/prisma";
import {
  Prisma,
  CampaignChannel,
  CampaignStatus,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit.service";
import {
  resolveCustomerIdsForSegment,
  segmentCustomers,
  metricsToCsv,
  type CustomerMetrics,
} from "@/modules/crm/crm.service";
import type { CampaignInput, SegmentFilters } from "@/modules/crm/crm.schema";
import { toNumber, roundMoney } from "@/lib/money";

function emptyToNull(v?: string | null) {
  if (v === undefined) return undefined;
  if (v === null || String(v).trim() === "") return null;
  return String(v).trim();
}

export async function listCampaigns(
  companyId: string,
  query: { page: number; pageSize: number; status?: string; search?: string },
) {
  const where: Prisma.CampaignWhereInput = { companyId };
  if (query.status && query.status !== "all") {
    where.status = query.status as CampaignStatus;
  }
  if (query.search?.trim()) {
    where.OR = [
      { name: { contains: query.search.trim(), mode: "insensitive" } },
      { description: { contains: query.search.trim(), mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [total, items] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.pageSize,
      include: {
        coupon: { select: { id: true, code: true } },
        _count: { select: { customers: true } },
      },
    }),
  ]);

  return {
    items: items.map((c) => ({
      ...c,
      selectedCount: c._count.customers || c.selectedCount,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getCampaign(companyId: string, id: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id, companyId },
    include: {
      coupon: true,
      customers: {
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              whatsapp: true,
              marketingConsent: true,
              city: true,
              state: true,
            },
          },
        },
      },
    },
  });
  if (!campaign) return null;

  // Sales that used the campaign coupon during campaign window
  let couponSales: Array<{
    id: string;
    number: number;
    total: number;
    saleDate: Date;
    customer: { name: string } | null;
  }> = [];
  if (campaign.couponId) {
    const sales = await prisma.saleOrder.findMany({
      where: {
        companyId,
        couponId: campaign.couponId,
        status: { in: ["COMPLETED", "CONFIRMED"] },
        ...(campaign.startsAt || campaign.endsAt
          ? {
              saleDate: {
                ...(campaign.startsAt ? { gte: campaign.startsAt } : {}),
                ...(campaign.endsAt ? { lte: campaign.endsAt } : {}),
              },
            }
          : {}),
      },
      orderBy: { saleDate: "desc" },
      take: 50,
      include: {
        customer: { select: { name: true } },
      },
    });
    couponSales = sales.map((s) => ({
      id: s.id,
      number: s.number,
      total: toNumber(s.total),
      saleDate: s.saleDate,
      customer: s.customer,
    }));
  }

  return {
    ...campaign,
    segmentFilters: campaign.segmentFilters as SegmentFilters | null,
    customers: campaign.customers.map((cc) => cc.customer),
    selectedCount: campaign.customers.length,
    couponSales,
    couponSalesTotal: roundMoney(
      couponSales.reduce((s, x) => s + x.total, 0),
    ),
    couponSalesCount: couponSales.length,
  };
}

export async function createCampaign(
  companyId: string,
  userId: string,
  input: CampaignInput,
) {
  const requireConsent =
    input.channel === "WHATSAPP" || input.channel === "EMAIL";

  let customerIds = input.customerIds ?? [];
  if (!customerIds.length) {
    customerIds = await resolveCustomerIdsForSegment(
      companyId,
      {
        ...(input.segmentFilters ?? {}),
        quick: (input.segmentKey as never) || "all",
      },
      {
        requireMarketingConsent: requireConsent,
        channel: input.channel,
      },
    );
  } else if (requireConsent) {
    // Filter out non-consenting for WhatsApp/Email
    const allowed = await prisma.customer.findMany({
      where: {
        companyId,
        id: { in: customerIds },
        marketingConsent: true,
        active: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    customerIds = allowed.map((c) => c.id);
  }

  if (input.couponId) {
    const coupon = await prisma.coupon.findFirst({
      where: { id: input.couponId, companyId },
    });
    if (!coupon) throw new Error("Cupom inválido");
  }

  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.campaign.create({
      data: {
        companyId,
        name: input.name.trim(),
        description: emptyToNull(input.description) ?? null,
        segmentKey: emptyToNull(input.segmentKey) ?? null,
        segmentFilters: (input.segmentFilters ??
          null) as Prisma.InputJsonValue,
        channel: input.channel as CampaignChannel,
        message: emptyToNull(input.message) ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        couponId: emptyToNull(input.couponId) ?? null,
        selectedCount: customerIds.length,
        status: (input.status as CampaignStatus) ?? "DRAFT",
        customers: {
          create: customerIds.map((customerId) => ({ customerId })),
        },
      },
    });

    await writeAuditLog(
      {
        companyId,
        userId,
        action: "CREATE",
        entityType: "Campaign",
        entityId: created.id,
        after: {
          name: created.name,
          channel: created.channel,
          selectedCount: customerIds.length,
        },
      },
      tx,
    );

    return created;
  });

  return getCampaign(companyId, campaign.id);
}

export async function updateCampaignStatus(
  companyId: string,
  userId: string,
  id: string,
  status: CampaignStatus,
) {
  const current = await prisma.campaign.findFirst({
    where: { id, companyId },
  });
  if (!current) throw new Error("Campanha não encontrada");

  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      status,
      completedAt: status === "COMPLETED" ? new Date() : current.completedAt,
    },
  });

  await writeAuditLog({
    companyId,
    userId,
    action: "CAMPAIGN_STATUS",
    entityType: "Campaign",
    entityId: id,
    before: { status: current.status },
    after: { status },
  });

  return updated;
}

export async function markCampaignCompleted(
  companyId: string,
  userId: string,
  id: string,
) {
  return updateCampaignStatus(companyId, userId, id, "COMPLETED");
}

export async function exportCampaignContacts(
  companyId: string,
  userId: string,
  id: string,
) {
  const campaign = await getCampaign(companyId, id);
  if (!campaign) throw new Error("Campanha não encontrada");

  const rows: CustomerMetrics[] = campaign.customers.map((c) => ({
    customerId: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    whatsapp: c.whatsapp,
    city: c.city,
    state: c.state,
    origin: "",
    marketingConsent: c.marketingConsent,
    createdAt: new Date(),
    firstPurchase: null,
    lastPurchase: null,
    orderCount: 0,
    totalSpent: 0,
    ticketAvg: 0,
    daysSinceLast: null,
    topChannel: null,
    tags: [],
  }));

  await writeAuditLog({
    companyId,
    userId,
    action: "EXPORT",
    entityType: "Campaign",
    entityId: id,
    after: { count: rows.length, type: "contacts" },
  });

  return metricsToCsv(rows);
}

export async function previewSegment(
  companyId: string,
  filters: SegmentFilters & { quick?: string },
  channel?: string,
) {
  const requireConsent =
    channel === "WHATSAPP" || channel === "EMAIL";

  const result = await segmentCustomers(companyId, {
    ...filters,
    quick: (filters.quick as never) || "all",
    page: 1,
    pageSize: 10000,
    sortBy: "totalSpent",
    sortDir: "desc",
  });

  let items = result.items;
  if (requireConsent) {
    items = items.filter((m) => m.marketingConsent);
  }

  return {
    count: items.length,
    excludedNoConsent: requireConsent
      ? result.items.length - items.length
      : 0,
    sample: items.slice(0, 20),
  };
}

export function formatContactsForCopy(
  customers: Array<{
    name: string;
    whatsapp: string | null;
    phone: string | null;
    email: string | null;
  }>,
  channel: string,
) {
  if (channel === "EMAIL") {
    return customers
      .map((c) => c.email)
      .filter(Boolean)
      .join("; ");
  }
  // WhatsApp / default: phones
  return customers
    .map((c) => c.whatsapp || c.phone)
    .filter(Boolean)
    .join("\n");
}
