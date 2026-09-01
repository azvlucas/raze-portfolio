import { requireSession } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { changePasswordSchema } from "@/modules/users/user.schema";
import { changeOwnPassword } from "@/modules/users/user.service";

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    const data = changePasswordSchema.parse(await request.json());
    await changeOwnPassword(
      user.id,
      data.currentPassword,
      data.newPassword,
    );
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
