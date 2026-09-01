import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { periodQuerySchema } from "@/modules/reports/report.schema";
import { getStrategicDashboard } from "@/modules/reports/dashboard.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
    const { searchParams } = new URL(request.url);
    const query = periodQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );

    const data = await getStrategicDashboard(
      user.companyId,
      query.from,
      query.to,
      query.compare,
    );

    const canSeeMargins =
      user.permissions.includes(PERMISSIONS.DASHBOARD_MANAGERIAL) ||
      user.permissions.includes(PERMISSIONS.PRODUCTS_VIEW_MARGINS);

    if (!canSeeMargins) {
      data.kpis.cogs = 0;
      data.kpis.grossProfit = 0;
      data.kpis.marginPercent = 0;
      data.kpis.stockValueCost = 0;
      if (data.comparison) {
        data.comparison.grossProfit = {
          current: 0,
          previous: 0,
          changePercent: 0,
        };
      }
      data.charts.revenueByDay = data.charts.revenueByDay.map((d) => ({
        ...d,
        profit: 0,
      }));
    }

    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}
