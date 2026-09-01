import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  inventoryCountSchema,
} from "@/modules/stock/stock.schema";
import {
  confirmInventory,
  getInventory,
  updateInventoryCounts,
} from "@/modules/stock/stock.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.STOCK_INVENTORY);
    const { id } = await params;
    const inv = await getInventory(user.companyId, id);
    if (!inv) return jsonError("Inventário não encontrado", 404);
    return jsonOk(inv);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.STOCK_INVENTORY);
    const { id } = await params;
    const body = inventoryCountSchema.parse(await request.json());
    const inv = await updateInventoryCounts(user.companyId, id, body.items);
    return jsonOk(inv);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.STOCK_INVENTORY);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body.action === "confirm") {
      const inv = await confirmInventory(user.companyId, user.id, id);
      return jsonOk(inv);
    }
    return jsonError("Ação inválida", 400);
  } catch (error) {
    return handleApiError(error);
  }
}
