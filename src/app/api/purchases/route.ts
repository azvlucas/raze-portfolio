import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import {
  purchaseListQuerySchema,
  purchaseOrderSchema,
} from "@/modules/purchases/purchase.schema";
import {
  createPurchaseOrder,
  listPurchaseOrders,
} from "@/modules/purchases/purchase.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.PURCHASES_VIEW);
    const { searchParams } = new URL(request.url);
    const query = purchaseListQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    return jsonOk(await listPurchaseOrders(user.companyId, query));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.PURCHASES_CREATE);
    const data = purchaseOrderSchema.parse(await request.json());
    const order = await createPurchaseOrder(user.companyId, user.id, data);
    return jsonCreated(order);
  } catch (error) {
    return handleApiError(error);
  }
}
