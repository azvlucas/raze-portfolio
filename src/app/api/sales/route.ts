import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import {
  saleListQuerySchema,
  saleOrderSchema,
} from "@/modules/sales/sale.schema";
import { createSale, listSales } from "@/modules/sales/sale.service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_VIEW);
    const { searchParams } = new URL(request.url);
    const query = saleListQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    return jsonOk(await listSales(user.companyId, query));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_CREATE);
    const data = saleOrderSchema.parse(await request.json());

    const canDiscount = user.permissions.includes(PERMISSIONS.SALES_DISCOUNT);
    let maxDiscountPercent = 5;
    const setting = await prisma.setting.findFirst({
      where: {
        companyId: user.companyId,
        key:
          user.roleCode === "admin" || user.roleCode === "manager"
            ? "max_discount_percent_manager"
            : "max_discount_percent_seller",
      },
    });
    if (setting) maxDiscountPercent = Number(setting.value) || maxDiscountPercent;
    if (user.roleCode === "admin") maxDiscountPercent = 100;

    const sale = await createSale(user.companyId, user.id, data, {
      canDiscount: canDiscount || data.orderDiscount === 0,
      maxDiscountPercent,
    });
    return jsonCreated(sale);
  } catch (error) {
    return handleApiError(error);
  }
}
