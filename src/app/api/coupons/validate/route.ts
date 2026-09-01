import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { z } from "zod";
import { validateAndComputeCoupon } from "@/modules/coupons/coupon.service";

const schema = z.object({
  code: z.string().min(1),
  orderSubtotal: z.coerce.number().min(0),
  channel: z.string().default("STORE"),
  customerId: z.string().optional().nullable(),
  productIds: z.array(z.string()).optional().default([]),
  categoryIds: z.array(z.string()).optional().default([]),
});

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_CREATE);
    const data = schema.parse(await request.json());
    const result = await validateAndComputeCoupon({
      companyId: user.companyId,
      ...data,
    });
    return jsonOk({
      couponId: result.coupon.id,
      code: result.coupon.code,
      discountAmount: result.discountAmount,
      discountType: result.coupon.discountType,
      discountValue: result.coupon.discountValue,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
