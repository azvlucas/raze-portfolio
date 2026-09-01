import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { saleCostSchema } from "@/modules/sale-costs/sale-cost.schema";
import {
  deleteSaleCost,
  updateSaleCost,
} from "@/modules/sale-costs/sale-cost.service";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const { id } = await params;
    const data = saleCostSchema.parse(await request.json());
    const item = await updateSaleCost(user.companyId, user.id, id, data);
    return jsonOk(item);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const { id } = await params;
    await deleteSaleCost(user.companyId, user.id, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
