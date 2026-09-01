import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonError } from "@/lib/api";
import { getSale, saleReceiptText } from "@/modules/sales/sale.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_VIEW);
    const { id } = await params;
    const sale = await getSale(user.companyId, id);
    if (!sale) return jsonError("Venda não encontrada", 404);
    const text = saleReceiptText(sale);
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `inline; filename="venda-${sale.number}.txt"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
