import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  purchaseOrderSchema,
  purchaseStatusActionSchema,
} from "@/modules/purchases/purchase.schema";
import {
  changePurchaseStatus,
  getPurchaseOrder,
  updatePurchaseOrder,
} from "@/modules/purchases/purchase.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.PURCHASES_VIEW);
    const { id } = await params;
    const order = await getPurchaseOrder(user.companyId, id);
    if (!order) return jsonError("Pedido não encontrado", 404);
    return jsonOk(order);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.PURCHASES_EDIT);
    const { id } = await params;
    const data = purchaseOrderSchema.parse(await request.json());
    const order = await updatePurchaseOrder(user.companyId, user.id, id, data);
    return jsonOk(order);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = purchaseStatusActionSchema.parse(await request.json());

    if (body.action === "approve") {
      await requirePermission(PERMISSIONS.PURCHASES_APPROVE);
    } else if (body.action === "cancel") {
      await requirePermission(PERMISSIONS.PURCHASES_CANCEL);
    } else {
      await requirePermission(PERMISSIONS.PURCHASES_EDIT);
    }

    const user = await requirePermission(PERMISSIONS.PURCHASES_VIEW);
    const updated = await changePurchaseStatus(
      user.companyId,
      user.id,
      id,
      body.action,
      body.reason,
    );
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
