import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { getCatalogMeta } from "@/modules/products/product.service";

export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_VIEW);
    const meta = await getCatalogMeta(user.companyId);
    return jsonOk(meta);
  } catch (error) {
    return handleApiError(error);
  }
}
