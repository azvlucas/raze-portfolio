import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import {
  supplierListQuerySchema,
  supplierSchema,
} from "@/modules/purchases/purchase.schema";
import {
  createSupplier,
  listSuppliers,
} from "@/modules/purchases/purchase.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.SUPPLIERS_VIEW);
    const { searchParams } = new URL(request.url);
    const query = supplierListQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    return jsonOk(await listSuppliers(user.companyId, query));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.SUPPLIERS_MANAGE);
    const data = supplierSchema.parse(await request.json());
    const supplier = await createSupplier(user.companyId, user.id, data);
    return jsonCreated(supplier);
  } catch (error) {
    return handleApiError(error);
  }
}
