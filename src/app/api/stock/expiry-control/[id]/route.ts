import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { deleteProductExpiry } from "@/modules/stock/stock.service";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.STOCK_ADJUST);
    const { id } = await params;
    const result = await deleteProductExpiry(user.companyId, user.id, id);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
