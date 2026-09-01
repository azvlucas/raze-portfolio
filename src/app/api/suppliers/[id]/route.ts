import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { supplierSchema } from "@/modules/purchases/purchase.schema";
import {
  deactivateSupplier,
  getSupplier,
  updateSupplier,
} from "@/modules/purchases/purchase.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.SUPPLIERS_VIEW);
    const { id } = await params;
    const supplier = await getSupplier(user.companyId, id);
    if (!supplier) return jsonError("Fornecedor não encontrado", 404);
    return jsonOk(supplier);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.SUPPLIERS_MANAGE);
    const { id } = await params;
    const data = supplierSchema.parse(await request.json());
    const supplier = await updateSupplier(user.companyId, user.id, id, data);
    return jsonOk(supplier);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.SUPPLIERS_MANAGE);
    const { id } = await params;
    await deactivateSupplier(user.companyId, user.id, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
