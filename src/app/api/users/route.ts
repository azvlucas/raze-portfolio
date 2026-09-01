import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import { userCreateSchema } from "@/modules/users/user.schema";
import { createUser, listUsers } from "@/modules/users/user.service";

export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.USERS_MANAGE);
    return jsonOk(await listUsers(user.companyId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
    const data = userCreateSchema.parse(await request.json());
    const created = await createUser(actor.companyId, actor.id, data);
    return jsonCreated(created);
  } catch (error) {
    return handleApiError(error);
  }
}
