import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { getCrmOverview } from "@/modules/crm/crm.service";

export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.CRM_VIEW);
    return jsonOk(await getCrmOverview(user.companyId));
  } catch (error) {
    return handleApiError(error);
  }
}
