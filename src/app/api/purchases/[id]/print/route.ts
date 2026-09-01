import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonError } from "@/lib/api";
import {
  getPurchaseOrder,
  purchaseOrderToText,
} from "@/modules/purchases/purchase.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.PURCHASES_VIEW);
    const { id } = await params;
    const order = await getPurchaseOrder(user.companyId, id);
    if (!order) return jsonError("Pedido não encontrado", 404);

    const text = purchaseOrderToText(order);
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `inline; filename="pedido-compra-${order.number}.txt"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
