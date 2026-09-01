import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import {
  customerListQuerySchema,
  customerSchema,
} from "@/modules/customers/customer.schema";
import {
  createCustomer,
  findPossibleDuplicates,
  listCustomers,
} from "@/modules/customers/customer.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
    const { searchParams } = new URL(request.url);
    const query = customerListQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    return jsonOk(await listCustomers(user.companyId, query));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.CUSTOMERS_CREATE);
    const body = await request.json();
    const data = customerSchema.parse(body);

    if (body.checkDuplicates !== false) {
      const dups = await findPossibleDuplicates(user.companyId, data);
      if (dups.length && !body.force) {
        return jsonOk({ duplicates: dups, needsConfirmation: true });
      }
    }

    const customer = await createCustomer(user.companyId, user.id, data);
    return jsonCreated(customer);
  } catch (error) {
    return handleApiError(error);
  }
}
