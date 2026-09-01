import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { listMovements } from "@/modules/stock/stock.service";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  productId: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.STOCK_VIEW);
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(searchParams.entries()));
    const result = await listMovements(user.companyId, query);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
