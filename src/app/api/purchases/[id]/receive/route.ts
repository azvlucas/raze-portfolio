import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { receiptSchema } from "@/modules/purchases/purchase.schema";
import { receivePurchase } from "@/modules/purchases/purchase.service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.PURCHASES_RECEIVE);
    const { id } = await params;
    const data = receiptSchema.parse(await request.json());
    const result = await receivePurchase(user.companyId, user.id, id, data);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
