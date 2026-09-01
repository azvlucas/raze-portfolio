import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { listProductsBySupplier } from "@/modules/stock/stock.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.STOCK_VIEW);
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get("supplierId");
    if (!supplierId) {
      return jsonError("Informe o fornecedor", 400);
    }
    return jsonOk(await listProductsBySupplier(user.companyId, supplierId));
  } catch (error) {
    return handleApiError(error);
  }
}
