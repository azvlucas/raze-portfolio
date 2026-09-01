import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { rankingsQuerySchema } from "@/modules/reports/report.schema";
import { getRankings } from "@/modules/reports/rankings.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.RANKINGS_VIEW);
    const { searchParams } = new URL(request.url);
    const query = rankingsQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    const data = await getRankings(user.companyId, query);

    const canSeeMargins =
      user.permissions.includes(PERMISSIONS.DASHBOARD_MANAGERIAL) ||
      user.permissions.includes(PERMISSIONS.PRODUCTS_VIEW_MARGINS);

    if (!canSeeMargins) {
      data.productsByProfit = data.productsByProfit.map((p) => ({
        ...p,
        cost: 0,
        profit: 0,
      }));
    }

    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}
