import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import { inventoryCreateSchema } from "@/modules/stock/stock.schema";
import {
  createInventory,
  listInventories,
} from "@/modules/stock/stock.service";

export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.STOCK_INVENTORY);
    return jsonOk(await listInventories(user.companyId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.STOCK_INVENTORY);
    const body = inventoryCreateSchema.parse(await request.json().catch(() => ({})));
    const inv = await createInventory(user.companyId, user.id, body.notes);
    return jsonCreated(inv);
  } catch (error) {
    return handleApiError(error);
  }
}
