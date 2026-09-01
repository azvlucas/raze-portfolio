import { requirePermission, requireSession } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { settingsUpdateSchema } from "@/modules/users/user.schema";
import { getSettings, updateSettings } from "@/modules/users/user.service";

export async function GET() {
  try {
    const user = await requireSession();
    return jsonOk(await getSettings(user.companyId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const data = settingsUpdateSchema.parse(await request.json());
    const settings = await updateSettings(user.companyId, user.id, data);
    return jsonOk(settings);
  } catch (error) {
    return handleApiError(error);
  }
}
