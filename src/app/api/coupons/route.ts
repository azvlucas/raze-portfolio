import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import {
  couponListQuerySchema,
  couponSchema,
} from "@/modules/coupons/coupon.schema";
import { createCoupon, listCoupons } from "@/modules/coupons/coupon.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.COUPONS_VIEW);
    const { searchParams } = new URL(request.url);
    const query = couponListQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    return jsonOk(await listCoupons(user.companyId, query));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.COUPONS_MANAGE);
    const data = couponSchema.parse(await request.json());
    const coupon = await createCoupon(user.companyId, user.id, data);
    return jsonCreated(coupon);
  } catch (error) {
    return handleApiError(error);
  }
}
