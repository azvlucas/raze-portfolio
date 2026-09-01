import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { reportQuerySchema } from "@/modules/reports/report.schema";
import { runReport } from "@/modules/reports/reports.service";
import { writeAuditLog } from "@/modules/audit/audit.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.REPORTS_VIEW);
    const { searchParams } = new URL(request.url);
    const query = reportQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );

    const result = await runReport(user.companyId, query);

    if (query.format === "csv") {
      await writeAuditLog({
        companyId: user.companyId,
        userId: user.id,
        action: "EXPORT",
        entityType: "Report",
        after: { type: query.type, rows: result.rows.length },
      });
      return new Response(result.csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="relatorio-${query.type}.csv"`,
        },
      });
    }

    return jsonOk({
      title: result.title,
      rows: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
