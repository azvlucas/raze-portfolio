import { prisma } from "@/lib/prisma";
import { Prisma, CustomerOrigin, PetSpecies } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit.service";
import { toNumber, roundMoney } from "@/lib/money";
import type { CustomerInput, PetInput } from "./customer.schema";

function emptyToNull(v?: string | null) {
  if (v === undefined) return undefined;
  if (v === null || String(v).trim() === "") return null;
  return String(v).trim();
}

export async function listCustomers(
  companyId: string,
  query: {
    page: number;
    pageSize: number;
    search?: string;
    active?: string;
    origin?: string;
  },
) {
  const where: Prisma.CustomerWhereInput = {
    companyId,
    deletedAt: null,
  };
  if (query.active === "true") where.active = true;
  if (query.active === "false") where.active = false;
  if (query.origin && query.origin !== "all") {
    where.origin = query.origin as CustomerOrigin;
  }
  if (query.search?.trim()) {
    const s = query.search.trim();
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { document: { contains: s, mode: "insensitive" } },
      { email: { contains: s, mode: "insensitive" } },
      { phone: { contains: s, mode: "insensitive" } },
      { whatsapp: { contains: s, mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [total, items] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: query.pageSize,
      include: {
        pets: { where: { active: true }, select: { id: true, name: true, species: true } },
        tags: { include: { tag: true } },
        _count: { select: { saleOrders: true } },
      },
    }),
  ]);

  return {
    items: items.map((c) => ({
      ...c,
      tags: c.tags.map((t) => t.tag),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function findPossibleDuplicates(
  companyId: string,
  input: { document?: string | null; email?: string | null; phone?: string | null; whatsapp?: string | null },
  excludeId?: string,
) {
  const or: Prisma.CustomerWhereInput[] = [];
  if (input.document) or.push({ document: input.document });
  if (input.email) or.push({ email: input.email });
  if (input.phone) or.push({ phone: input.phone });
  if (input.whatsapp) {
    or.push({ whatsapp: input.whatsapp });
    or.push({ phone: input.whatsapp });
  }
  if (!or.length) return [];

  return prisma.customer.findMany({
    where: {
      companyId,
      deletedAt: null,
      OR: or,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, name: true, document: true, email: true, phone: true, whatsapp: true },
    take: 10,
  });
}

export async function getCustomer(companyId: string, id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, companyId, deletedAt: null },
    include: {
      pets: { orderBy: { name: "asc" } },
      tags: { include: { tag: true } },
      saleOrders: {
        where: { status: { in: ["COMPLETED", "CONFIRMED"] } },
        orderBy: { saleDate: "desc" },
        take: 30,
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, categoryId: true, category: { select: { name: true } } },
              },
            },
          },
        },
      },
      couponUsages: {
        include: { coupon: { select: { code: true, description: true } } },
        orderBy: { usedAt: "desc" },
        take: 20,
      },
    },
  });
  if (!customer) return null;

  const completed = customer.saleOrders;
  const totalSpent = completed.reduce((s, o) => s + toNumber(o.total), 0);
  const orderCount = completed.length;
  const ticketAvg = orderCount ? roundMoney(totalSpent / orderCount) : 0;
  const firstPurchase = completed.length
    ? completed[completed.length - 1].saleDate
    : null;
  const lastPurchase = completed[0]?.saleDate ?? null;

  const productMap = new Map<string, { name: string; qty: number; total: number }>();
  const categoryMap = new Map<string, number>();
  const channelMap = new Map<string, number>();

  for (const order of completed) {
    channelMap.set(order.channel, (channelMap.get(order.channel) ?? 0) + 1);
    for (const item of order.items) {
      const prev = productMap.get(item.productId) ?? {
        name: item.product.name,
        qty: 0,
        total: 0,
      };
      prev.qty += toNumber(item.quantity);
      prev.total += toNumber(item.total);
      productMap.set(item.productId, prev);
      const cat = item.product.category?.name || "Sem categoria";
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + toNumber(item.total));
    }
  }

  const daysSinceLast = lastPurchase
    ? Math.floor(
        (Date.now() - new Date(lastPurchase).getTime()) / (1000 * 60 * 60 * 24),
      )
    : null;

  const duplicates = await findPossibleDuplicates(
    companyId,
    {
      document: customer.document,
      email: customer.email,
      phone: customer.phone,
      whatsapp: customer.whatsapp,
    },
    customer.id,
  );

  return {
    ...customer,
    tags: customer.tags.map((t) => t.tag),
    saleOrders: completed.map((o) => ({
      id: o.id,
      number: o.number,
      saleDate: o.saleDate,
      channel: o.channel,
      total: toNumber(o.total),
      status: o.status,
    })),
    stats: {
      firstPurchase,
      lastPurchase,
      orderCount,
      totalSpent: roundMoney(totalSpent),
      ticketAvg,
      daysSinceLast,
      topProducts: [...productMap.values()]
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5),
      topCategories: [...categoryMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, total]) => ({ name, total: roundMoney(total) })),
      topChannel: [...channelMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    },
    possibleDuplicates: duplicates,
  };
}

async function syncTags(
  companyId: string,
  customerId: string,
  tagNames: string[],
  tx: Prisma.TransactionClient,
) {
  await tx.customerTag.deleteMany({ where: { customerId } });
  for (const name of tagNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    let tag = await tx.tag.findFirst({
      where: { companyId, name: trimmed },
    });
    if (!tag) {
      tag = await tx.tag.create({
        data: { companyId, name: trimmed },
      });
    }
    await tx.customerTag.create({
      data: { customerId, tagId: tag.id },
    });
  }
}

export async function createCustomer(
  companyId: string,
  userId: string,
  input: CustomerInput,
) {
  const customer = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        companyId,
        name: input.name.trim(),
        document: emptyToNull(input.document) ?? null,
        phone: emptyToNull(input.phone) ?? null,
        whatsapp: emptyToNull(input.whatsapp) ?? null,
        email: emptyToNull(input.email) ?? null,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        address: emptyToNull(input.address) ?? null,
        city: emptyToNull(input.city) ?? null,
        state: emptyToNull(input.state)?.toUpperCase() ?? null,
        origin: input.origin as CustomerOrigin,
        notes: emptyToNull(input.notes) ?? null,
        marketingConsent: input.marketingConsent ?? false,
        active: input.active ?? true,
      },
    });
    await syncTags(companyId, created.id, input.tags ?? [], tx);
    await writeAuditLog(
      {
        companyId,
        userId,
        action: "CREATE",
        entityType: "Customer",
        entityId: created.id,
        after: { name: created.name },
      },
      tx,
    );
    return created;
  });
  return getCustomer(companyId, customer.id);
}

export async function updateCustomer(
  companyId: string,
  userId: string,
  id: string,
  input: CustomerInput,
) {
  const current = await prisma.customer.findFirst({
    where: { id, companyId, deletedAt: null },
  });
  if (!current) throw new Error("Cliente não encontrado");

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id },
      data: {
        name: input.name.trim(),
        document: emptyToNull(input.document) ?? null,
        phone: emptyToNull(input.phone) ?? null,
        whatsapp: emptyToNull(input.whatsapp) ?? null,
        email: emptyToNull(input.email) ?? null,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        address: emptyToNull(input.address) ?? null,
        city: emptyToNull(input.city) ?? null,
        state: emptyToNull(input.state)?.toUpperCase() ?? null,
        origin: input.origin as CustomerOrigin,
        notes: emptyToNull(input.notes) ?? null,
        marketingConsent: input.marketingConsent ?? false,
        active: input.active ?? true,
      },
    });
    await syncTags(companyId, id, input.tags ?? [], tx);
    await writeAuditLog(
      {
        companyId,
        userId,
        action: "UPDATE",
        entityType: "Customer",
        entityId: id,
        before: { name: current.name },
        after: { name: input.name },
      },
      tx,
    );
  });

  return getCustomer(companyId, id);
}

export async function deactivateCustomer(
  companyId: string,
  userId: string,
  id: string,
) {
  const current = await prisma.customer.findFirst({
    where: { id, companyId, deletedAt: null },
  });
  if (!current) throw new Error("Cliente não encontrado");
  await prisma.customer.update({
    where: { id },
    data: { active: false },
  });
  await writeAuditLog({
    companyId,
    userId,
    action: "DEACTIVATE",
    entityType: "Customer",
    entityId: id,
  });
  return { ok: true };
}

export async function upsertPet(
  companyId: string,
  customerId: string,
  input: PetInput,
  petId?: string,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId, deletedAt: null },
  });
  if (!customer) throw new Error("Cliente não encontrado");

  if (petId) {
    return prisma.pet.update({
      where: { id: petId },
      data: {
        name: input.name.trim(),
        species: input.species as PetSpecies,
        breed: emptyToNull(input.breed) ?? null,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        notes: emptyToNull(input.notes) ?? null,
        active: input.active ?? true,
      },
    });
  }

  return prisma.pet.create({
    data: {
      customerId,
      name: input.name.trim(),
      species: input.species as PetSpecies,
      breed: emptyToNull(input.breed) ?? null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      notes: emptyToNull(input.notes) ?? null,
      active: input.active ?? true,
    },
  });
}

export async function deletePet(companyId: string, customerId: string, petId: string) {
  const pet = await prisma.pet.findFirst({
    where: { id: petId, customerId, customer: { companyId } },
  });
  if (!pet) throw new Error("Pet não encontrado");
  await prisma.pet.update({
    where: { id: petId },
    data: { active: false },
  });
  return { ok: true };
}
