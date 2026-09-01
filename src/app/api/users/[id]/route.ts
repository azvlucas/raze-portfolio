import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { userUpdateSchema } from "@/modules/users/user.schema";
import { deactivateUser, updateUser } from "@/modules/users/user.service";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
    const { id } = await params;
    const data = userUpdateSchema.parse(await request.json());
    const updated = await updateUser(actor.companyId, actor.id, id, data);
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
    const { id } = await params;
    await deactivateUser(actor.companyId, actor.id, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
