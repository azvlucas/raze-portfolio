import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  expiryControlListQuerySchema,
  expiryControlRegisterSchema,
} from "@/modules/stock/stock.schema";
import {
  listExpiryControlProducts,
  registerExpiries,
} from "@/modules/stock/stock.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.STOCK_VIEW);
    const { searchParams } = new URL(request.url);
    const query = expiryControlListQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    return jsonOk(await listExpiryControlProducts(user.companyId, query));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.STOCK_ADJUST);
    const body = await request.json();
    const data = expiryControlRegisterSchema.parse(body);
    const result = await registerExpiries(user.companyId, user.id, data);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
