import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";
import {
  ALL_PERMISSION_CODES,
  ROLE_CODES,
  ROLE_PERMISSION_MAP,
  PERMISSIONS,
} from "../src/lib/permissions";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

function requireSeedPassword(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < 16 || value.startsWith("replace-with")) {
    throw new Error(`${name} must be explicitly set to at least 16 characters`);
  }
  return value;
}

const PERMISSION_META: Record<string, { module: string; action: string; description: string }> = {
  [PERMISSIONS.PRODUCTS_VIEW]: { module: "products", action: "view", description: "Visualizar produtos" },
  [PERMISSIONS.PRODUCTS_CREATE]: { module: "products", action: "create", description: "Criar produtos" },
  [PERMISSIONS.PRODUCTS_EDIT]: { module: "products", action: "edit", description: "Editar produtos" },
  [PERMISSIONS.PRODUCTS_CHANGE_COST]: { module: "products", action: "change_cost", description: "Alterar custos" },
  [PERMISSIONS.PRODUCTS_CHANGE_PRICE]: { module: "products", action: "change_price", description: "Alterar preços" },
  [PERMISSIONS.PRODUCTS_VIEW_MARGINS]: { module: "products", action: "view_margins", description: "Visualizar margens" },
  [PERMISSIONS.STOCK_VIEW]: { module: "stock", action: "view", description: "Visualizar estoque" },
  [PERMISSIONS.STOCK_ADJUST]: { module: "stock", action: "adjust", description: "Ajustar estoque" },
  [PERMISSIONS.STOCK_INVENTORY]: { module: "stock", action: "inventory", description: "Realizar inventário" },
  [PERMISSIONS.PURCHASES_VIEW]: { module: "purchases", action: "view", description: "Visualizar compras" },
  [PERMISSIONS.PURCHASES_CREATE]: { module: "purchases", action: "create", description: "Criar pedidos de compra" },
  [PERMISSIONS.PURCHASES_EDIT]: { module: "purchases", action: "edit", description: "Editar pedidos de compra" },
  [PERMISSIONS.PURCHASES_CANCEL]: { module: "purchases", action: "cancel", description: "Cancelar pedidos de compra" },
  [PERMISSIONS.PURCHASES_RECEIVE]: { module: "purchases", action: "receive", description: "Receber compras" },
  [PERMISSIONS.PURCHASES_APPROVE]: { module: "purchases", action: "approve", description: "Aprovar compras" },
  [PERMISSIONS.SALES_VIEW]: { module: "sales", action: "view", description: "Visualizar vendas" },
  [PERMISSIONS.SALES_CREATE]: { module: "sales", action: "create", description: "Criar vendas" },
  [PERMISSIONS.SALES_EDIT]: { module: "sales", action: "edit", description: "Editar vendas" },
  [PERMISSIONS.SALES_CANCEL]: { module: "sales", action: "cancel", description: "Cancelar vendas" },
  [PERMISSIONS.SALES_DISCOUNT]: { module: "sales", action: "discount", description: "Aplicar descontos" },
  [PERMISSIONS.CUSTOMERS_VIEW]: { module: "customers", action: "view", description: "Visualizar clientes" },
  [PERMISSIONS.CUSTOMERS_CREATE]: { module: "customers", action: "create", description: "Criar clientes" },
  [PERMISSIONS.CUSTOMERS_EDIT]: { module: "customers", action: "edit", description: "Editar clientes" },
  [PERMISSIONS.CRM_VIEW]: { module: "crm", action: "view", description: "Visualizar CRM" },
  [PERMISSIONS.CAMPAIGNS_VIEW]: { module: "campaigns", action: "view", description: "Visualizar campanhas" },
  [PERMISSIONS.CAMPAIGNS_MANAGE]: { module: "campaigns", action: "manage", description: "Gerenciar campanhas" },
  [PERMISSIONS.COUPONS_VIEW]: { module: "coupons", action: "view", description: "Visualizar cupons" },
  [PERMISSIONS.COUPONS_MANAGE]: { module: "coupons", action: "manage", description: "Gerenciar cupons" },
  [PERMISSIONS.SUPPLIERS_VIEW]: { module: "suppliers", action: "view", description: "Visualizar fornecedores" },
  [PERMISSIONS.SUPPLIERS_MANAGE]: { module: "suppliers", action: "manage", description: "Gerenciar fornecedores" },
  [PERMISSIONS.DASHBOARD_VIEW]: { module: "dashboard", action: "view", description: "Visualizar dashboard" },
  [PERMISSIONS.DASHBOARD_MANAGERIAL]: { module: "dashboard", action: "managerial", description: "Dashboards gerenciais" },
  [PERMISSIONS.REPORTS_VIEW]: { module: "reports", action: "view", description: "Visualizar relatórios" },
  [PERMISSIONS.RANKINGS_VIEW]: { module: "rankings", action: "view", description: "Visualizar rankings" },
  [PERMISSIONS.USERS_MANAGE]: { module: "users", action: "manage", description: "Gerenciar usuários" },
  [PERMISSIONS.SETTINGS_MANAGE]: { module: "settings", action: "manage", description: "Gerenciar configurações" },
};

async function main() {
  console.log("🌱 Seeding Raze Pet...");

  const company = await prisma.company.upsert({
    where: { document: "00.000.000/0001-00" },
    update: { name: "Raze Pet", tradeName: "Raze Pet" },
    create: {
      name: "Raze Pet",
      tradeName: "Raze Pet",
      document: "00.000.000/0001-00",
      email: "store@example.test",
      phone: "(11) 0000-0000",
    },
  });

  // Permissions
  for (const code of ALL_PERMISSION_CODES) {
    const meta = PERMISSION_META[code];
    await prisma.permission.upsert({
      where: { code },
      update: {
        module: meta.module,
        action: meta.action,
        description: meta.description,
      },
      create: {
        code,
        module: meta.module,
        action: meta.action,
        description: meta.description,
      },
    });
  }

  const rolesDef = [
    { code: ROLE_CODES.ADMIN, name: "Administrador", description: "Acesso total ao sistema" },
    { code: ROLE_CODES.MANAGER, name: "Gerente", description: "Gestão operacional e gerencial" },
    { code: ROLE_CODES.SELLER, name: "Vendedor", description: "Vendas e atendimento" },
    { code: ROLE_CODES.STOCKKEEPER, name: "Estoquista", description: "Estoque e recebimentos" },
  ];

  const roleIds: Record<string, string> = {};
  for (const r of rolesDef) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: r,
    });
    roleIds[r.code] = role.id;

    const permCodes = ROLE_PERMISSION_MAP[r.code] ?? [];
    for (const code of permCodes) {
      const perm = await prisma.permission.findUnique({ where: { code } });
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: perm.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  // Settings
  const settings: Record<string, string> = {
    days_to_expiry_alert: "30",
    max_discount_percent_seller: "5",
    max_discount_percent_manager: "20",
    company_timezone: "America/Sao_Paulo",
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { companyId_key: { companyId: company.id, key } },
      update: { value },
      create: { companyId: company.id, key, value },
    });
  }

  // Payment methods
  const paymentMethods = [
    { code: "CASH", name: "Dinheiro", allowsInstallments: false, defaultFeePercent: 0, estimatedDaysToReceive: 0, sortOrder: 1 },
    { code: "PIX", name: "PIX", allowsInstallments: false, defaultFeePercent: 0, estimatedDaysToReceive: 0, sortOrder: 2 },
    { code: "DEBIT", name: "Cartão de débito", allowsInstallments: false, defaultFeePercent: 1.5, estimatedDaysToReceive: 1, sortOrder: 3 },
    { code: "CREDIT", name: "Cartão de crédito", allowsInstallments: true, defaultFeePercent: 3.5, estimatedDaysToReceive: 30, sortOrder: 4 },
    { code: "BOLETO", name: "Boleto", allowsInstallments: false, defaultFeePercent: 0, estimatedDaysToReceive: 3, sortOrder: 5 },
    { code: "TRANSFER", name: "Transferência", allowsInstallments: false, defaultFeePercent: 0, estimatedDaysToReceive: 1, sortOrder: 6 },
    { code: "OTHER", name: "Outro", allowsInstallments: false, defaultFeePercent: 0, estimatedDaysToReceive: 0, sortOrder: 99 },
  ];
  for (const pm of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { companyId_code: { companyId: company.id, code: pm.code } },
      update: {
        name: pm.name,
        allowsInstallments: pm.allowsInstallments,
        defaultFeePercent: pm.defaultFeePercent,
        estimatedDaysToReceive: pm.estimatedDaysToReceive,
        sortOrder: pm.sortOrder,
        active: true,
      },
      create: { companyId: company.id, ...pm },
    });
  }

  // Units
  const units = [
    { code: "UN", name: "Unidade" },
    { code: "KG", name: "Quilograma" },
    { code: "PC", name: "Pacote" },
    { code: "CX", name: "Caixa" },
  ];
  const unitIds: Record<string, string> = {};
  for (const u of units) {
    const unit = await prisma.unit.upsert({
      where: { companyId_code: { companyId: company.id, code: u.code } },
      update: { name: u.name, active: true },
      create: { companyId: company.id, ...u },
    });
    unitIds[u.code] = unit.id;
  }

  // Categories (petiscos / mastigáveis)
  const categories = [
    "Petiscos Naturais",
    "Mastigáveis",
    "Bifinhos",
    "Ossos e Chifres",
    "Acessórios",
  ];
  const categoryIds: string[] = [];
  for (const name of categories) {
    const cat = await prisma.category.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: { active: true },
      create: { companyId: company.id, name },
    });
    categoryIds.push(cat.id);
  }

  // Brands
  const brands = ["Raze Pet", "Natural Dog", "Pet Treats BR", "Genérico"];
  const brandIds: string[] = [];
  for (const name of brands) {
    const brand = await prisma.brand.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: { active: true },
      create: { companyId: company.id, name },
    });
    brandIds.push(brand.id);
  }

  // Sample products
  const products = [
    {
      internalCode: "RP-001",
      barcode: "7890000000001",
      name: "Bifinho Natural de Frango 100g",
      categoryId: categoryIds[0],
      brandId: brandIds[0],
      costPrice: 8.5,
      salePrice: 16.9,
      minStock: 20,
      trackExpiry: true,
      location: "A1",
    },
    {
      internalCode: "RP-002",
      barcode: "7890000000002",
      name: "Mastigável de Tendão Bovino",
      categoryId: categoryIds[1],
      brandId: brandIds[0],
      costPrice: 12.0,
      salePrice: 24.9,
      minStock: 15,
      trackExpiry: true,
      location: "A2",
    },
    {
      internalCode: "RP-003",
      barcode: "7890000000003",
      name: "Chifre de Boi Médio",
      categoryId: categoryIds[3],
      brandId: brandIds[1],
      costPrice: 18.0,
      salePrice: 39.9,
      minStock: 10,
      trackExpiry: false,
      location: "B1",
    },
    {
      internalCode: "RP-004",
      barcode: "7890000000004",
      name: "Petisco Desidratado de Fígado 80g",
      categoryId: categoryIds[0],
      brandId: brandIds[2],
      costPrice: 9.0,
      salePrice: 19.9,
      minStock: 25,
      trackExpiry: true,
      location: "A1",
    },
    {
      internalCode: "RP-005",
      barcode: "7890000000005",
      name: "Kit Amostra Petiscos Sortidos",
      categoryId: categoryIds[0],
      brandId: brandIds[0],
      costPrice: 22.0,
      salePrice: 45.0,
      minStock: 5,
      trackExpiry: true,
      location: "C1",
    },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: {
        companyId_internalCode: {
          companyId: company.id,
          internalCode: p.internalCode,
        },
      },
      update: {
        name: p.name,
        barcode: p.barcode,
        categoryId: p.categoryId,
        brandId: p.brandId,
        costPrice: p.costPrice,
        salePrice: p.salePrice,
        minStock: p.minStock,
        trackExpiry: p.trackExpiry,
        location: p.location,
        active: true,
      },
      create: {
        companyId: company.id,
        unitId: unitIds.UN,
        currentStock: 0,
        description: p.name,
        ...p,
      },
    });
  }

  // Sample supplier
  await prisma.supplier.upsert({
    where: { id: "seed-supplier-001" },
    update: { legalName: "Naturais & Cia Distribuidora LTDA" },
    create: {
      id: "seed-supplier-001",
      companyId: company.id,
      legalName: "Naturais & Cia Distribuidora LTDA",
      tradeName: "Naturais & Cia",
      document: "12.345.678/0001-90",
      phone: "(11) 3333-4444",
      whatsapp: "(11) 99999-0001",
      email: "supplier@example.test",
      city: "São Paulo",
      state: "SP",
      mainContact: "Carlos",
      avgDeliveryDays: 5,
      paymentTerms: "28 dias",
    },
  });

  // Sample customers
  const customers = [
    {
      id: "seed-customer-001",
      name: "Ana Paula Silva",
      phone: "(11) 98888-1111",
      whatsapp: "(11) 98888-1111",
      email: "customer.one@example.test",
      city: "São Paulo",
      state: "SP",
      origin: "INSTAGRAM" as const,
      marketingConsent: true,
    },
    {
      id: "seed-customer-002",
      name: "Bruno Oliveira",
      phone: "(11) 97777-2222",
      whatsapp: "(11) 97777-2222",
      email: "customer.two@example.test",
      city: "Guarulhos",
      state: "SP",
      origin: "WHATSAPP" as const,
      marketingConsent: true,
    },
    {
      id: "seed-customer-003",
      name: "Carla Mendes",
      phone: "(11) 96666-3333",
      city: "São Paulo",
      state: "SP",
      origin: "STORE" as const,
      marketingConsent: false,
    },
  ];

  for (const c of customers) {
    await prisma.customer.upsert({
      where: { id: c.id },
      update: { name: c.name },
      create: { companyId: company.id, ...c },
    });
  }

  await prisma.pet.upsert({
    where: { id: "seed-pet-001" },
    update: {},
    create: {
      id: "seed-pet-001",
      customerId: "seed-customer-001",
      name: "Thor",
      species: "DOG",
      breed: "Golden Retriever",
      birthDate: new Date("2021-05-10"),
    },
  });

  await prisma.pet.upsert({
    where: { id: "seed-pet-002" },
    update: {},
    create: {
      id: "seed-pet-002",
      customerId: "seed-customer-002",
      name: "Luna",
      species: "DOG",
      breed: "SRD",
    },
  });

  // Admin user
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.test")
    .trim()
    .toLowerCase();
  const adminPassword = requireSeedPassword("ADMIN_PASSWORD");
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      active: true,
      roleId: roleIds[ROLE_CODES.ADMIN],
      companyId: company.id,
      name: "Administrador",
    },
    create: {
      companyId: company.id,
      roleId: roleIds[ROLE_CODES.ADMIN],
      name: "Administrador",
      email: adminEmail,
      passwordHash,
      active: true,
    },
  });

  // Demo seller
  const sellerEmail = (process.env.SEED_SELLER_EMAIL || "seller@example.test")
    .trim()
    .toLowerCase();
  const sellerPassword = requireSeedPassword("SEED_SELLER_PASSWORD");
  const sellerHash = await bcrypt.hash(sellerPassword, 12);
  await prisma.user.upsert({
    where: { email: sellerEmail },
    update: { active: true, passwordHash: sellerHash },
    create: {
      companyId: company.id,
      roleId: roleIds[ROLE_CODES.SELLER],
      name: "Vendedor Demo",
      email: sellerEmail,
      passwordHash: sellerHash,
      active: true,
    },
  });

  console.log("✅ Seed concluído");
  console.log(`   Admin: ${adminEmail}`);
  console.log(`   Empresa: ${company.name} (${company.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
