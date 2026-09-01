import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import { saleCostSchema } from "@/modules/sale-costs/sale-cost.schema";
import {
  createSaleCost,
  listSaleCosts,
} from "@/modules/sale-costs/sale-cost.service";

export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
    return jsonOk(await listSaleCosts(user.companyId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const data = saleCostSchema.parse(await request.json());
    const item = await createSaleCost(user.companyId, user.id, data);
    return jsonCreated(item);
  } catch (error) {
    return handleApiError(error);
  }
}
