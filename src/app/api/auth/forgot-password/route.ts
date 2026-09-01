import { handleApiError, jsonOk } from "@/lib/api";
import { resetPasswordRequestSchema } from "@/modules/users/user.schema";
import { requestPasswordReset } from "@/modules/users/user.service";
import { checkLoginRateLimit } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const data = resetPasswordRequestSchema.parse(await request.json());
    const rate = checkLoginRateLimit(`forgot:${data.email}`, 5, 15 * 60 * 1000);
    if (!rate.allowed) {
      return jsonOk({
        message: "Muitas tentativas. Tente novamente em alguns minutos.",
        token: null,
      });
    }
    const result = await requestPasswordReset(data.email);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
