import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { stockAdjustSchema } from "@/modules/stock/stock.schema";
import { adjustStock } from "@/modules/stock/stock.service";

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.STOCK_ADJUST);
    const data = stockAdjustSchema.parse(await request.json());
    const result = await adjustStock(user.companyId, user.id, data);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
