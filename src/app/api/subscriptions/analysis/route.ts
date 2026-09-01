import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { getPetSizeProductAnalysis } from "@/modules/products/product.service";

export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_VIEW);
    const data = await getPetSizeProductAnalysis(user.companyId);
    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}
