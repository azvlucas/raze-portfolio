import { handleApiError, jsonOk } from "@/lib/api";
import { resetPasswordConfirmSchema } from "@/modules/users/user.schema";
import { confirmPasswordReset } from "@/modules/users/user.service";

export async function POST(request: Request) {
  try {
    const data = resetPasswordConfirmSchema.parse(await request.json());
    await confirmPasswordReset(data.token, data.newPassword);
    return jsonOk({ ok: true, message: "Senha redefinida com sucesso" });
  } catch (error) {
    return handleApiError(error);
  }
}
