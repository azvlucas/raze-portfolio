import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit.service";
import {
  calcMarginPercent,
  markupFromPrices,
  roundMoney,
  salePriceFromMarkup,
  toNumber,
} from "@/lib/money";
import type {
  ProductCreateInput,
  ProductListQuery,
  ProductUpdateInput,
} from "./product.schema";

function emptyToNull(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === "") return null;
  return value.trim();
}

const PET_SIZE_ORDER = ["SMALL", "MEDIUM", "LARGE"] as const;

function uniquePetSizes(
  sizes?: Array<"SMALL" | "MEDIUM" | "LARGE"> | null,
): Array<"SMALL" | "MEDIUM" | "LARGE"> {
  if (!sizes?.length) return [];
  const set = new Set(sizes);
  return PET_SIZE_ORDER.filter((s) => set.has(s));
}

/**
 * Primeiro código interno livre (inteiros positivos: "1", "2", …).
 * Considera todos os produtos da empresa (incl. soft-deleted) por causa da unique constraint.
 */
export async function allocateNextInternalCode(
  companyId: string,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  const client = tx ?? prisma;
  const products = await client.product.findMany({
    where: { companyId },
    select: { internalCode: true },
  });
  const used = new Set(products.map((p) => p.internalCode));
  let n = 1;
  while (used.has(String(n))) n += 1;
  return String(n);
}

export async function listProducts(companyId: string, query: ProductListQuery) {
  const where: Prisma.ProductWhereInput = {
    companyId,
    deletedAt: null,
  };

  if (query.active === "true") where.active = true;
  if (query.active === "false") where.active = false;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.brandId) where.brandId = query.brandId;
  if (query.supplierId) where.supplierId = query.supplierId;
  if (query.petSize) {
    where.petSizes = { has: query.petSize };
  }

  if (query.search?.trim()) {
    const s = query.search.trim();
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { internalCode: { contains: s, mode: "insensitive" } },
      { barcode: { contains: s, mode: "insensitive" } },
    ];
  }

  // stock filters that need raw comparison use post-filter or raw query
  if (query.stock === "out") {
    where.currentStock = { lte: 0 };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput = {
    [query.sortBy]: query.sortDir,
  };

  // For "low" we need currentStock > 0 AND <= minStock — use raw ids when needed
  if (query.stock === "low") {
    const lowIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM products
      WHERE "companyId" = ${companyId}
        AND "deletedAt" IS NULL
        AND "currentStock" > 0
        AND "currentStock" <= "minStock"
    `;
    where.id = { in: lowIds.map((r) => r.id) };
  }

  if (query.stock === "ok") {
    const okIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM products
      WHERE "companyId" = ${companyId}
        AND "deletedAt" IS NULL
        AND "currentStock" > "minStock"
    `;
    where.id = { in: okIds.map((r) => r.id) };
  }

  const skip = (query.page - 1) * query.pageSize;

  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take: query.pageSize,
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        supplier: {
          select: { id: true, legalName: true, tradeName: true },
        },
        unit: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  return {
    items: items.map((p) => ({
      ...p,
      costPrice: toNumber(p.costPrice),
      markupPercent: toNumber(p.markupPercent),
      salePrice: toNumber(p.salePrice),
      currentStock: toNumber(p.currentStock),
      minStock: toNumber(p.minStock),
      marginPercent: calcMarginPercent(p.costPrice, p.salePrice),
      stockStatus:
        toNumber(p.currentStock) <= 0
          ? "out"
          : toNumber(p.currentStock) <= toNumber(p.minStock)
            ? "low"
            : "ok",
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getProduct(companyId: string, id: string) {
  const product = await prisma.product.findFirst({
    where: { id, companyId, deletedAt: null },
    include: {
      category: true,
      brand: true,
      supplier: {
        select: { id: true, legalName: true, tradeName: true, active: true },
      },
      unit: true,
      priceHistory: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!product) return null;
  return {
    ...product,
    costPrice: toNumber(product.costPrice),
    markupPercent: toNumber(product.markupPercent),
    salePrice: toNumber(product.salePrice),
    currentStock: toNumber(product.currentStock),
    minStock: toNumber(product.minStock),
    marginPercent: calcMarginPercent(product.costPrice, product.salePrice),
    priceHistory: product.priceHistory.map((h) => ({
      ...h,
      costPrice: h.costPrice == null ? null : toNumber(h.costPrice),
      salePrice: h.salePrice == null ? null : toNumber(h.salePrice),
    })),
  };
}

async function resolveSupplierId(
  companyId: string,
  supplierId: string | null | undefined,
): Promise<string | null | undefined> {
  if (supplierId === undefined) return undefined;
  if (supplierId === null || supplierId.trim() === "") return null;
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, companyId, deletedAt: null, active: true },
  });
  if (!supplier) throw new Error("Fornecedor inválido");
  return supplier.id;
}

export async function createProduct(
  companyId: string,
  userId: string,
  input: ProductCreateInput,
) {
  const requestedCode = input.internalCode?.trim() || null;

  if (requestedCode) {
    const existing = await prisma.product.findFirst({
      where: {
        companyId,
        internalCode: requestedCode,
      },
    });
    if (existing) {
      throw new Error("Já existe produto com este código interno");
    }
  }

  if (input.barcode) {
    const barcodeExists = await prisma.product.findFirst({
      where: { companyId, barcode: input.barcode, deletedAt: null },
    });
    if (barcodeExists) {
      throw new Error("Já existe produto com este código de barras");
    }
  }

  const unit = await prisma.unit.findFirst({
    where: { id: input.unitId, companyId, active: true },
  });
  if (!unit) throw new Error("Unidade inválida");

  const supplierId = await resolveSupplierId(companyId, input.supplierId);

  const product = await prisma.$transaction(async (tx) => {
    const internalCode =
      requestedCode ?? (await allocateNextInternalCode(companyId, tx));

    const created = await tx.product.create({
      data: {
        companyId,
        internalCode,
        barcode: emptyToNull(input.barcode) ?? null,
        name: input.name.trim(),
        description: emptyToNull(input.description) ?? null,
        categoryId: emptyToNull(input.categoryId) ?? null,
        brandId: emptyToNull(input.brandId) ?? null,
        supplierId: supplierId ?? null,
        unitId: input.unitId,
        costPrice: roundMoney(input.costPrice),
        markupPercent: roundMoney(input.markupPercent ?? 0),
        salePrice: roundMoney(
          input.salePrice > 0
            ? input.salePrice
            : salePriceFromMarkup(input.costPrice, input.markupPercent ?? 0),
        ),
        minStock: input.minStock,
        location: emptyToNull(input.location) ?? null,
        trackExpiry: input.trackExpiry,
        petSizes: uniquePetSizes(input.petSizes),
        imageUrl: emptyToNull(input.imageUrl) ?? null,
        active: input.active,
        currentStock: 0,
      },
    });

    await tx.priceHistory.create({
      data: {
        productId: created.id,
        costPrice: created.costPrice,
        salePrice: created.salePrice,
        reason: "Cadastro inicial",
        changedBy: userId,
      },
    });

    await writeAuditLog(
      {
        companyId,
        userId,
        action: "CREATE",
        entityType: "Product",
        entityId: created.id,
        after: created,
      },
      tx,
    );

    return created;
  });

  return getProduct(companyId, product.id);
}

export async function updateProduct(
  companyId: string,
  userId: string,
  id: string,
  input: ProductUpdateInput,
) {
  const current = await prisma.product.findFirst({
    where: { id, companyId, deletedAt: null },
  });
  if (!current) throw new Error("Produto não encontrado");

  if (input.barcode && input.barcode !== current.barcode) {
    const dup = await prisma.product.findFirst({
      where: {
        companyId,
        barcode: input.barcode,
        deletedAt: null,
        NOT: { id },
      },
    });
    if (dup) throw new Error("Já existe produto com este código de barras");
  }

  const supplierId =
    input.supplierId !== undefined
      ? await resolveSupplierId(companyId, input.supplierId)
      : undefined;

  const costChanged =
    input.costPrice !== undefined &&
    roundMoney(input.costPrice) !== toNumber(current.costPrice);
  const priceChanged =
    input.salePrice !== undefined &&
    roundMoney(input.salePrice) !== toNumber(current.salePrice);

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id },
      data: {
        barcode:
          input.barcode !== undefined ? emptyToNull(input.barcode) : undefined,
        name: input.name?.trim(),
        description:
          input.description !== undefined
            ? emptyToNull(input.description)
            : undefined,
        categoryId:
          input.categoryId !== undefined
            ? emptyToNull(input.categoryId)
            : undefined,
        brandId:
          input.brandId !== undefined ? emptyToNull(input.brandId) : undefined,
        supplierId,
        unitId: input.unitId,
        costPrice:
          input.costPrice !== undefined
            ? roundMoney(input.costPrice)
            : undefined,
        markupPercent:
          input.markupPercent !== undefined
            ? roundMoney(input.markupPercent)
            : undefined,
        salePrice:
          input.salePrice !== undefined
            ? roundMoney(input.salePrice)
            : undefined,
        minStock: input.minStock,
        location:
          input.location !== undefined ? emptyToNull(input.location) : undefined,
        trackExpiry: input.trackExpiry,
        petSizes:
          input.petSizes !== undefined
            ? uniquePetSizes(input.petSizes)
            : undefined,
        imageUrl:
          input.imageUrl !== undefined ? emptyToNull(input.imageUrl) : undefined,
        active: input.active,
      },
    });

    if (costChanged || priceChanged) {
      await tx.priceHistory.create({
        data: {
          productId: id,
          costPrice: updated.costPrice,
          salePrice: updated.salePrice,
          reason: input.priceChangeReason || "Alteração de preço/custo",
          changedBy: userId,
        },
      });
    }

    await writeAuditLog(
      {
        companyId,
        userId,
        action: "UPDATE",
        entityType: "Product",
        entityId: id,
        before: current,
        after: updated,
      },
      tx,
    );

    return updated;
  });

  return getProduct(companyId, product.id);
}

export async function deactivateProduct(
  companyId: string,
  userId: string,
  id: string,
) {
  const current = await prisma.product.findFirst({
    where: { id, companyId, deletedAt: null },
  });
  if (!current) throw new Error("Produto não encontrado");

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.product.update({
      where: { id },
      data: { active: false },
    });
    await writeAuditLog(
      {
        companyId,
        userId,
        action: "DEACTIVATE",
        entityType: "Product",
        entityId: id,
        before: { active: current.active },
        after: { active: false },
      },
      tx,
    );
    return result;
  });

  return updated;
}

export async function bulkChangePrices(
  companyId: string,
  userId: string,
  productIds: string[],
  percent: number,
  field: "salePrice" | "costPrice",
  reason?: string,
) {
  const products = await prisma.product.findMany({
    where: { companyId, id: { in: productIds }, deletedAt: null },
  });

  if (products.length === 0) throw new Error("Nenhum produto encontrado");

  const factor = 1 + percent / 100;

  await prisma.$transaction(async (tx) => {
    for (const p of products) {
      const current = toNumber(field === "salePrice" ? p.salePrice : p.costPrice);
      const next = roundMoney(current * factor);
      const data =
        field === "salePrice" ? { salePrice: next } : { costPrice: next };

      const updated = await tx.product.update({
        where: { id: p.id },
        data,
      });

      await tx.priceHistory.create({
        data: {
          productId: p.id,
          costPrice: updated.costPrice,
          salePrice: updated.salePrice,
          reason: reason || `Reajuste de ${percent}% em ${field}`,
          changedBy: userId,
        },
      });

      await writeAuditLog(
        {
          companyId,
          userId,
          action: "PRICE_BULK_CHANGE",
          entityType: "Product",
          entityId: p.id,
          before: { [field]: current },
          after: { [field]: next, percent },
        },
        tx,
      );
    }
  });

  return { updated: products.length };
}

const PET_SIZE_CSV: Record<string, "SMALL" | "MEDIUM" | "LARGE"> = {
  SMALL: "SMALL",
  MEDIUM: "MEDIUM",
  LARGE: "LARGE",
  P: "SMALL",
  M: "MEDIUM",
  G: "LARGE",
  PEQUENO: "SMALL",
  MEDIO: "MEDIUM",
  MÉDIO: "MEDIUM",
  GRANDE: "LARGE",
};

function petSizesToCsvLabel(
  sizes: Array<"SMALL" | "MEDIUM" | "LARGE"> | undefined,
): string {
  if (!sizes?.length) return "";
  const map = { SMALL: "P", MEDIUM: "M", LARGE: "G" } as const;
  return sizes.map((s) => map[s]).join(",");
}

function parsePetSizesCsv(raw: string): Array<"SMALL" | "MEDIUM" | "LARGE"> {
  if (!raw.trim()) return [];
  const parts = raw.split(/[,|/;\s]+/).map((p) => p.trim().toUpperCase());
  const out: Array<"SMALL" | "MEDIUM" | "LARGE"> = [];
  for (const p of parts) {
    const mapped = PET_SIZE_CSV[p];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return uniquePetSizes(out);
}

export function productsToCsv(
  rows: Array<{
    internalCode: string;
    barcode: string | null;
    name: string;
    description: string | null;
    category?: { name: string } | null;
    brand?: { name: string } | null;
    supplier?: { legalName: string; tradeName?: string | null } | null;
    unit?: { code: string } | null;
    costPrice: number;
    salePrice: number;
    minStock: number;
    currentStock: number;
    location: string | null;
    trackExpiry: boolean;
    petSizes?: Array<"SMALL" | "MEDIUM" | "LARGE">;
    active: boolean;
  }>,
) {
  const header = [
    "codigo_interno",
    "codigo_barras",
    "nome",
    "descricao",
    "categoria",
    "marca",
    "fornecedor",
    "unidade",
    "custo",
    "preco_venda",
    "estoque_minimo",
    "estoque_atual",
    "localizacao",
    "portes",
    "controla_validade",
    "ativo",
  ];

  const escape = (v: string | number | boolean | null | undefined) => {
    const s = v == null ? "" : String(v);
    if (s.includes(";") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.internalCode,
        r.barcode,
        r.name,
        r.description,
        r.category?.name,
        r.brand?.name,
        r.supplier?.tradeName || r.supplier?.legalName,
        r.unit?.code,
        r.costPrice,
        r.salePrice,
        r.minStock,
        r.currentStock,
        r.location,
        petSizesToCsvLabel(r.petSizes),
        r.trackExpiry ? "sim" : "nao",
        r.active ? "sim" : "nao",
      ]
        .map(escape)
        .join(";"),
    );
  }
  return "\uFEFF" + lines.join("\n");
}

export type CsvImportRow = {
  internalCode: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  categoryName?: string | null;
  brandName?: string | null;
  /** undefined = coluna ausente (não alterar); null/vazio = limpar vínculo */
  supplierName?: string | null;
  unitCode: string;
  costPrice: number;
  salePrice: number;
  minStock: number;
  location?: string | null;
  trackExpiry: boolean;
  petSizes?: Array<"SMALL" | "MEDIUM" | "LARGE">;
  active: boolean;
};

export function parseProductsCsv(content: string): CsvImportRow[] {
  const text = content.replace(/^\uFEFF/, "").trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());

  const idx = (names: string[]) =>
    headers.findIndex((h) => names.includes(h));

  const iCode = idx(["codigo_interno", "internalcode", "codigo"]);
  const iName = idx(["nome", "name"]);
  const iUnit = idx(["unidade", "unit", "unitcode"]);
  if (iCode < 0 || iName < 0 || iUnit < 0) {
    throw new Error(
      "CSV inválido: colunas obrigatórias codigo_interno, nome, unidade",
    );
  }

  const iBarcode = idx(["codigo_barras", "barcode"]);
  const iDesc = idx(["descricao", "description"]);
  const iCat = idx(["categoria", "category"]);
  const iBrand = idx(["marca", "brand"]);
  const iSupplier = idx(["fornecedor", "supplier", "suppliername"]);
  const iCost = idx(["custo", "cost", "costprice"]);
  const iSale = idx(["preco_venda", "preco", "saleprice"]);
  const iMin = idx(["estoque_minimo", "minstock"]);
  const iLoc = idx(["localizacao", "location"]);
  const iPortes = idx(["portes", "porte", "petsizes", "pet_sizes"]);
  const iExp = idx(["controla_validade", "trackexpiry"]);
  const iActive = idx(["ativo", "active"]);

  const parseBool = (v: string) =>
    ["1", "true", "sim", "yes", "s"].includes(v.trim().toLowerCase());

  const rows: CsvImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    const internalCode = cols[iCode];
    const name = cols[iName];
    const unitCode = cols[iUnit];
    if (!internalCode || !name || !unitCode) continue;

    rows.push({
      internalCode,
      name,
      unitCode: unitCode.toUpperCase(),
      barcode: iBarcode >= 0 ? cols[iBarcode] || null : null,
      description: iDesc >= 0 ? cols[iDesc] || null : null,
      categoryName: iCat >= 0 ? cols[iCat] || null : null,
      brandName: iBrand >= 0 ? cols[iBrand] || null : null,
      supplierName:
        iSupplier >= 0 ? cols[iSupplier]?.trim() || null : undefined,
      costPrice: iCost >= 0 ? Number(cols[iCost].replace(",", ".")) || 0 : 0,
      salePrice: iSale >= 0 ? Number(cols[iSale].replace(",", ".")) || 0 : 0,
      minStock: iMin >= 0 ? Number(cols[iMin].replace(",", ".")) || 0 : 0,
      location: iLoc >= 0 ? cols[iLoc] || null : null,
      petSizes: iPortes >= 0 ? parsePetSizesCsv(cols[iPortes] || "") : undefined,
      trackExpiry: iExp >= 0 ? parseBool(cols[iExp] || "") : false,
      active: iActive >= 0 ? parseBool(cols[iActive] || "sim") : true,
    });
  }
  return rows;
}

export async function importProductsCsv(
  companyId: string,
  userId: string,
  rows: CsvImportRow[],
) {
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    try {
      let unit = await prisma.unit.findFirst({
        where: { companyId, code: row.unitCode },
      });
      if (!unit) {
        unit = await prisma.unit.create({
          data: {
            companyId,
            code: row.unitCode,
            name: row.unitCode,
          },
        });
      }

      let categoryId: string | null = null;
      if (row.categoryName) {
        let cat = await prisma.category.findFirst({
          where: { companyId, name: row.categoryName },
        });
        if (!cat) {
          cat = await prisma.category.create({
            data: { companyId, name: row.categoryName },
          });
        }
        categoryId = cat.id;
      }

      let brandId: string | null = null;
      if (row.brandName) {
        let brand = await prisma.brand.findFirst({
          where: { companyId, name: row.brandName },
        });
        if (!brand) {
          brand = await prisma.brand.create({
            data: { companyId, name: row.brandName },
          });
        }
        brandId = brand.id;
      }

      let supplierId: string | null | undefined = undefined;
      if (row.supplierName !== undefined) {
        if (!row.supplierName) {
          supplierId = null;
        } else {
          const name = row.supplierName.trim();
          const supplier = await prisma.supplier.findFirst({
            where: {
              companyId,
              deletedAt: null,
              OR: [
                { legalName: { equals: name, mode: "insensitive" } },
                { tradeName: { equals: name, mode: "insensitive" } },
              ],
            },
          });
          if (!supplier) {
            throw new Error(
              `Fornecedor "${name}" não encontrado (cadastre antes de importar)`,
            );
          }
          supplierId = supplier.id;
        }
      }

      const existing = await prisma.product.findFirst({
        where: {
          companyId,
          internalCode: row.internalCode,
          deletedAt: null,
        },
      });

      if (existing) {
        await updateProduct(companyId, userId, existing.id, {
          barcode: row.barcode,
          name: row.name,
          description: row.description,
          categoryId,
          brandId,
          ...(supplierId !== undefined ? { supplierId } : {}),
          unitId: unit.id,
          costPrice: row.costPrice,
          markupPercent: markupFromPrices(row.costPrice, row.salePrice),
          salePrice: row.salePrice,
          minStock: row.minStock,
          location: row.location,
          trackExpiry: row.trackExpiry,
          ...(row.petSizes !== undefined ? { petSizes: row.petSizes } : {}),
          active: row.active,
          priceChangeReason: "Importação CSV",
        });
        updated += 1;
      } else {
        await createProduct(companyId, userId, {
          internalCode: row.internalCode || undefined,
          barcode: row.barcode,
          name: row.name,
          description: row.description,
          categoryId,
          brandId,
          supplierId: supplierId ?? null,
          unitId: unit.id,
          costPrice: row.costPrice,
          markupPercent: markupFromPrices(row.costPrice, row.salePrice),
          salePrice: row.salePrice,
          minStock: row.minStock,
          location: row.location,
          trackExpiry: row.trackExpiry,
          petSizes: row.petSizes ?? [],
          active: row.active,
          imageUrl: null,
        });
        created += 1;
      }
    } catch (e) {
      errors.push(
        `Linha ${index + 2}: ${e instanceof Error ? e.message : "erro"}`,
      );
    }
  }

  return { created, updated, errors };
}

// ── Auxiliaries ──────────────────────────────

export async function listCategories(companyId: string) {
  return prisma.category.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { name: "asc" },
  });
}

export async function upsertCategory(
  companyId: string,
  data: { name: string; description?: string | null; active?: boolean },
  id?: string,
) {
  if (id) {
    return prisma.category.update({
      where: { id },
      data: {
        name: data.name.trim(),
        description: data.description ?? null,
        active: data.active ?? true,
      },
    });
  }
  return prisma.category.create({
    data: {
      companyId,
      name: data.name.trim(),
      description: data.description ?? null,
      active: data.active ?? true,
    },
  });
}

export async function listBrands(companyId: string) {
  return prisma.brand.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { name: "asc" },
  });
}

export async function upsertBrand(
  companyId: string,
  data: { name: string; active?: boolean },
  id?: string,
) {
  if (id) {
    return prisma.brand.update({
      where: { id },
      data: { name: data.name.trim(), active: data.active ?? true },
    });
  }
  return prisma.brand.create({
    data: {
      companyId,
      name: data.name.trim(),
      active: data.active ?? true,
    },
  });
}

export async function listUnits(companyId: string) {
  return prisma.unit.findMany({
    where: { companyId },
    orderBy: { code: "asc" },
  });
}

export async function upsertUnit(
  companyId: string,
  data: { code: string; name: string; active?: boolean },
  id?: string,
) {
  if (id) {
    return prisma.unit.update({
      where: { id },
      data: {
        code: data.code.toUpperCase(),
        name: data.name.trim(),
        active: data.active ?? true,
      },
    });
  }
  return prisma.unit.create({
    data: {
      companyId,
      code: data.code.toUpperCase(),
      name: data.name.trim(),
      active: data.active ?? true,
    },
  });
}

export async function listActiveSuppliersForCatalog(companyId: string) {
  return prisma.supplier.findMany({
    where: { companyId, deletedAt: null, active: true },
    orderBy: { legalName: "asc" },
    select: { id: true, legalName: true, tradeName: true },
  });
}

export async function getCatalogMeta(companyId: string) {
  const [categories, brands, units, suppliers] = await Promise.all([
    listCategories(companyId),
    listBrands(companyId),
    listUnits(companyId),
    listActiveSuppliersForCatalog(companyId),
  ]);
  return { categories, brands, units, suppliers };
}

/**
 * Análise de catálogo para gestão de assinaturas:
 * quantos produtos ativos **com estoque** servem cada porte
 * (um produto pode entrar em mais de um).
 */
export async function getPetSizeProductAnalysis(companyId: string) {
  const base = {
    companyId,
    deletedAt: null,
    active: true,
    currentStock: { gt: 0 },
  } as const;

  const [totalWithStock, noSize, small, medium, large] = await Promise.all([
    prisma.product.count({ where: base }),
    prisma.product.count({
      where: { ...base, petSizes: { isEmpty: true } },
    }),
    prisma.product.count({
      where: { ...base, petSizes: { has: "SMALL" } },
    }),
    prisma.product.count({
      where: { ...base, petSizes: { has: "MEDIUM" } },
    }),
    prisma.product.count({
      where: { ...base, petSizes: { has: "LARGE" } },
    }),
  ]);

  const bySize = [
    {
      size: "SMALL" as const,
      label: "Pequeno",
      shortLabel: "P",
      productCount: small,
    },
    {
      size: "MEDIUM" as const,
      label: "Médio",
      shortLabel: "M",
      productCount: medium,
    },
    {
      size: "LARGE" as const,
      label: "Grande",
      shortLabel: "G",
      productCount: large,
    },
  ];

  return {
    totalActiveProducts: totalWithStock,
    productsWithoutSize: noSize,
    bySize,
  };
}
