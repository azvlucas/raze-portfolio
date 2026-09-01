import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { segmentQuerySchema } from "@/modules/crm/crm.schema";
import { segmentCustomers, metricsToCsv } from "@/modules/crm/crm.service";
import { writeAuditLog } from "@/modules/audit/audit.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.CRM_VIEW);
    const { searchParams } = new URL(request.url);
    const raw = Object.fromEntries(searchParams.entries());

    // coerce booleans from query string
    const coerced = {
      ...raw,
      marketingConsentOnly:
        raw.marketingConsentOnly === "true"
          ? true
          : raw.marketingConsentOnly === "false"
            ? false
            : undefined,
      onlyOnce:
        raw.onlyOnce === "true"
          ? true
          : raw.onlyOnce === "false"
            ? false
            : undefined,
      recurring:
        raw.recurring === "true"
          ? true
          : raw.recurring === "false"
            ? false
            : undefined,
    };

    const query = segmentQuerySchema.parse(coerced);
    const result = await segmentCustomers(user.companyId, query);

    if (searchParams.get("export") === "csv") {
      const full = await segmentCustomers(user.companyId, {
        ...query,
        page: 1,
        pageSize: 10000,
      });
      await writeAuditLog({
        companyId: user.companyId,
        userId: user.id,
        action: "EXPORT",
        entityType: "CrmSegment",
        after: { count: full.items.length, quick: query.quick },
      });
      const csv = metricsToCsv(full.items);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="crm-segmento.csv"`,
        },
      });
    }

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
