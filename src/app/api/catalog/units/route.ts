import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import { unitSchema } from "@/modules/products/product.schema";
import { listUnits, upsertUnit } from "@/modules/products/product.service";

export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_VIEW);
    return jsonOk(await listUnits(user.companyId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_CREATE);
    const data = unitSchema.parse(await request.json());
    const item = await upsertUnit(user.companyId, data);
    return jsonCreated(item);
  } catch (error) {
    return handleApiError(error);
  }
}
