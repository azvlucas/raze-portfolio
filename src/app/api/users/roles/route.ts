import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { listRoles } from "@/modules/users/user.service";

export async function GET() {
  try {
    await requirePermission(PERMISSIONS.USERS_MANAGE);
    const roles = await listRoles();
    return jsonOk(
      roles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        userCount: r._count.users,
        permissions: r.permissions.map((p) => p.permission.code),
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
