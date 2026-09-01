import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { bulkPriceChangeSchema } from "@/modules/products/product.schema";
import { bulkChangePrices } from "@/modules/products/product.service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = bulkPriceChangeSchema.parse(body);

    if (data.field === "costPrice") {
      await requirePermission(PERMISSIONS.PRODUCTS_CHANGE_COST);
    } else {
      await requirePermission(PERMISSIONS.PRODUCTS_CHANGE_PRICE);
    }

    const user = await requirePermission(PERMISSIONS.PRODUCTS_EDIT);
    const result = await bulkChangePrices(
      user.companyId,
      user.id,
      data.productIds,
      data.percent,
      data.field,
      data.reason,
    );
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
