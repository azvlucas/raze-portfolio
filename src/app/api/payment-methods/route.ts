import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { listPaymentMethods } from "@/modules/sales/sale.service";

export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_VIEW);
    return jsonOk(await listPaymentMethods(user.companyId));
  } catch (error) {
    return handleApiError(error);
  }
}
