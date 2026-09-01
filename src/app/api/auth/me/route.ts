import { getSession } from "@/lib/auth";
import { jsonOk, jsonError } from "@/lib/api";

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.user) {
    return jsonError("Não autenticado", 401);
  }
  return jsonOk({ user: session.user });
}
