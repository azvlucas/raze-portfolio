import { loginWithCredentials, AuthError } from "@/lib/auth";
import { loginSchema } from "@/modules/auth/auth.schema";
import { handleApiError, jsonOk } from "@/lib/api";
import { writeAuditLog } from "@/modules/audit/audit.service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = loginSchema.parse(body);
    const user = await loginWithCredentials(data.email, data.password);

    await writeAuditLog({
      companyId: user.companyId,
      userId: user.id,
      action: "LOGIN",
      entityType: "User",
      entityId: user.id,
      after: { email: user.email },
    });

    return jsonOk({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roleName: user.roleName,
        roleCode: user.roleCode,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleApiError(error);
    }
    return handleApiError(error);
  }
}
