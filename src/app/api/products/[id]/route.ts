import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { productUpdateSchema } from "@/modules/products/product.schema";
import {
  deactivateProduct,
  getProduct,
  updateProduct,
} from "@/modules/products/product.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_VIEW);
    const { id } = await params;
    const product = await getProduct(user.companyId, id);
    if (!product) return jsonError("Produto não encontrado", 404);
    return jsonOk(product);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_EDIT);
    const { id } = await params;
    const body = await request.json();
    const data = productUpdateSchema.parse(body);

    if (data.costPrice !== undefined) {
      await requirePermission(PERMISSIONS.PRODUCTS_CHANGE_COST);
    }
    if (data.salePrice !== undefined) {
      await requirePermission(PERMISSIONS.PRODUCTS_CHANGE_PRICE);
    }

    const product = await updateProduct(user.companyId, user.id, id, data);
    return jsonOk(product);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_EDIT);
    const { id } = await params;
    await deactivateProduct(user.companyId, user.id, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
