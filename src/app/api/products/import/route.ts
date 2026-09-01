import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  importProductsCsv,
  parseProductsCsv,
} from "@/modules/products/product.service";

export async function POST(request: Request) {
  try {
    const user = await requirePermission([
      PERMISSIONS.PRODUCTS_CREATE,
      PERMISSIONS.PRODUCTS_EDIT,
    ]);

    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      throw new Error("Arquivo CSV obrigatório");
    }

    const text = await file.text();
    const rows = parseProductsCsv(text);
    if (rows.length === 0) {
      throw new Error("Nenhuma linha válida no CSV");
    }

    const result = await importProductsCsv(user.companyId, user.id, rows);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
