import { prisma } from "@/lib/prisma";
import { SaleCostType } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit.service";
import { roundMoney, toNumber } from "@/lib/money";
import type { SaleCostInput } from "./sale-cost.schema";

export type SaleCostRow = {
  id: string;
  name: string;
  description: string | null;
  type: "FIXED" | "PERCENT";
  value: number;
  active: boolean;
  sortOrder: number;
};

export async function listSaleCosts(companyId: string, activeOnly = false) {
  const items = await prisma.saleCost.findMany({
    where: {
      companyId,
      ...(activeOnly ? { active: true } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return items.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    type: c.type as "FIXED" | "PERCENT",
    value: toNumber(c.value),
    active: c.active,
    sortOrder: c.sortOrder,
  }));
}

export async function createSaleCost(
  companyId: string,
  userId: string,
  input: SaleCostInput,
) {
  if (input.type === "PERCENT" && input.value > 100) {
    throw new Error("Percentual não pode exceder 100%");
  }
  const created = await prisma.saleCost.create({
    data: {
      companyId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      type: input.type as SaleCostType,
      value: input.value,
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await writeAuditLog({
    companyId,
    userId,
    action: "CREATE",
    entityType: "SaleCost",
    entityId: created.id,
    after: created,
  });
  return {
    ...created,
    value: toNumber(created.value),
  };
}

export async function updateSaleCost(
  companyId: string,
  userId: string,
  id: string,
  input: SaleCostInput,
) {
  const current = await prisma.saleCost.findFirst({
    where: { id, companyId },
  });
  if (!current) throw new Error("Custo de venda não encontrado");
  if (input.type === "PERCENT" && input.value > 100) {
    throw new Error("Percentual não pode exceder 100%");
  }

  const updated = await prisma.saleCost.update({
    where: { id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      type: input.type as SaleCostType,
      value: input.value,
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  await writeAuditLog({
    companyId,
    userId,
    action: "UPDATE",
    entityType: "SaleCost",
    entityId: id,
    before: current,
    after: updated,
  });

  return { ...updated, value: toNumber(updated.value) };
}

export async function deleteSaleCost(
  companyId: string,
  userId: string,
  id: string,
) {
  const current = await prisma.saleCost.findFirst({
    where: { id, companyId },
  });
  if (!current) throw new Error("Custo de venda não encontrado");
  await prisma.saleCost.delete({ where: { id } });
  await writeAuditLog({
    companyId,
    userId,
    action: "DELETE",
    entityType: "SaleCost",
    entityId: id,
    before: current,
  });
  return { ok: true };
}

/**
 * Calcula o total de custos comuns de venda sobre o faturamento de uma venda.
 * FIXED = valor fixo por venda | PERCENT = % sobre o total da venda.
 */
export function computeSaleOverhead(
  saleTotal: number,
  costs: Array<{ type: string; value: number | { toString(): string } }>,
): number {
  let total = 0;
  for (const c of costs) {
    const v = toNumber(c.value);
    if (c.type === "FIXED") {
      total += v;
    } else {
      total += (saleTotal * v) / 100;
    }
  }
  return roundMoney(total);
}

export async function getActiveSaleCosts(companyId: string) {
  return listSaleCosts(companyId, true);
}

export async function sumSaleOverheadForSales(
  companyId: string,
  sales: Array<{ total: unknown }>,
) {
  const costs = await getActiveSaleCosts(companyId);
  let overhead = 0;
  for (const s of sales) {
    overhead += computeSaleOverhead(
      toNumber(s.total as string | number | null),
      costs,
    );
  }
  return roundMoney(overhead);
}
