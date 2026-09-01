import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { batchListQuerySchema } from "@/modules/stock/stock.schema";
import { listBatches } from "@/modules/stock/stock.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.STOCK_VIEW);
    const { searchParams } = new URL(request.url);
    const query = batchListQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    const result = await listBatches(user.companyId, query);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
