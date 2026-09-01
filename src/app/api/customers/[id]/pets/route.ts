import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import { petSchema } from "@/modules/customers/customer.schema";
import { deletePet, upsertPet } from "@/modules/customers/customer.service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
    const { id: customerId } = await params;
    const body = await request.json();
    const data = petSchema.parse(body);
    const pet = await upsertPet(user.companyId, customerId, data, body.petId);
    return body.petId ? jsonOk(pet) : jsonCreated(pet);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
    const { id: customerId } = await params;
    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    if (!petId) throw new Error("petId obrigatório");
    await deletePet(user.companyId, customerId, petId);
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
