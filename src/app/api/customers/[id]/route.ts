import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { customerSchema } from "@/modules/customers/customer.schema";
import {
  deactivateCustomer,
  getCustomer,
  updateCustomer,
} from "@/modules/customers/customer.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
    const { id } = await params;
    const customer = await getCustomer(user.companyId, id);
    if (!customer) return jsonError("Cliente não encontrado", 404);
    return jsonOk(customer);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
    const { id } = await params;
    const data = customerSchema.parse(await request.json());
    const customer = await updateCustomer(user.companyId, user.id, id, data);
    return jsonOk(customer);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
    const { id } = await params;
    await deactivateCustomer(user.companyId, user.id, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
