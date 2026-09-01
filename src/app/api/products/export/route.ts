import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError } from "@/lib/api";
import { productListQuerySchema } from "@/modules/products/product.schema";
import {
  listProducts,
  productsToCsv,
} from "@/modules/products/product.service";
import { writeAuditLog } from "@/modules/audit/audit.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTS_VIEW);
    const { searchParams } = new URL(request.url);
    const query = productListQuerySchema.parse({
      ...Object.fromEntries(searchParams.entries()),
      page: "1",
      pageSize: "100",
    });

    // export up to 5000 matching rows
    const all = await listProducts(user.companyId, {
      ...query,
      page: 1,
      pageSize: 5000,
    });

    const csv = productsToCsv(all.items);

    await writeAuditLog({
      companyId: user.companyId,
      userId: user.id,
      action: "EXPORT",
      entityType: "Product",
      after: { count: all.items.length },
    });

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="produtos-raze-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
