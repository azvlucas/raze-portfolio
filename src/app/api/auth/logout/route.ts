import { getSession, logout } from "@/lib/auth";
import { jsonOk, handleApiError } from "@/lib/api";
import { writeAuditLog } from "@/modules/audit/audit.service";

export async function POST() {
  try {
    const session = await getSession();
    if (session.user) {
      await writeAuditLog({
        companyId: session.user.companyId,
        userId: session.user.id,
        action: "LOGOUT",
        entityType: "User",
        entityId: session.user.id,
      });
    }
    await logout();
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
