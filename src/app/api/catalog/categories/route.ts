import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import { categorySchema } from "@/modules/products/product.schema";
import {
  listCategories,
  upsertCategory,
} from "@/modules/products/product.service";

export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_VIEW);
    return jsonOk(await listCategories(user.companyId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_CREATE);
    const data = categorySchema.parse(await request.json());
    const item = await upsertCategory(user.companyId, data);
    return jsonCreated(item);
  } catch (error) {
    return handleApiError(error);
  }
}
