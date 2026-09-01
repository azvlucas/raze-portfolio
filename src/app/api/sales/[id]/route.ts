import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  saleCancelSchema,
  saleStatusSchema,
} from "@/modules/sales/sale.schema";
import {
  cancelSale,
  confirmSale,
  getSale,
} from "@/modules/sales/sale.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_VIEW);
    const { id } = await params;
    const sale = await getSale(user.companyId, id);
    if (!sale) return jsonError("Venda não encontrada", 404);
    return jsonOk(sale);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.action === "cancel" || body.reason) {
      const user = await requirePermission(PERMISSIONS.SALES_CANCEL);
      const data = saleCancelSchema.parse(
        body.action ? { reason: body.reason } : body,
      );
      if (body.action && body.action !== "cancel") {
        // fall through to status
      } else if (!body.action || body.action === "cancel") {
        const sale = await cancelSale(
          user.companyId,
          user.id,
          id,
          data.reason,
        );
        return jsonOk(sale);
      }
    }

    const statusBody = saleStatusSchema.parse(body);
    if (statusBody.action === "cancel") {
      const user = await requirePermission(PERMISSIONS.SALES_CANCEL);
      const sale = await cancelSale(
        user.companyId,
        user.id,
        id,
        statusBody.reason || "Cancelamento",
      );
      return jsonOk(sale);
    }

    if (statusBody.action === "confirm" || statusBody.action === "to_sale") {
      const user = await requirePermission(PERMISSIONS.SALES_CREATE);
      const sale = await confirmSale(user.companyId, user.id, id, body.payments);
      return jsonOk(sale);
    }

    return jsonError("Ação inválida", 400);
  } catch (error) {
    return handleApiError(error);
  }
}
