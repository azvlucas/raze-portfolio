import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import {
  productCreateSchema,
  productListQuerySchema,
} from "@/modules/products/product.schema";
import {
  createProduct,
  listProducts,
} from "@/modules/products/product.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_VIEW);
    const { searchParams } = new URL(request.url);
    const query = productListQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    const result = await listProducts(user.companyId, query);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_CREATE);
    const body = await request.json();
    const data = productCreateSchema.parse(body);

    if (
      data.costPrice !== undefined &&
      data.costPrice > 0 &&
      !user.permissions.includes(PERMISSIONS.PRODUCTS_CHANGE_COST)
    ) {
      // allow create with cost if has create; cost change permission for updates mainly
    }

    const product = await createProduct(user.companyId, user.id, data);
    return jsonCreated(product);
  } catch (error) {
    return handleApiError(error);
  }
}
