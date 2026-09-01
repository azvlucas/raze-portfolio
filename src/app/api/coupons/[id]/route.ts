import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { couponSchema } from "@/modules/coupons/coupon.schema";
import { getCoupon, updateCoupon } from "@/modules/coupons/coupon.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.COUPONS_VIEW);
    const { id } = await params;
    const coupon = await getCoupon(user.companyId, id);
    if (!coupon) return jsonError("Cupom não encontrado", 404);
    return jsonOk(coupon);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.COUPONS_MANAGE);
    const { id } = await params;
    const data = couponSchema.parse(await request.json());
    const coupon = await updateCoupon(user.companyId, user.id, id, data);
    return jsonOk(coupon);
  } catch (error) {
    return handleApiError(error);
  }
}
