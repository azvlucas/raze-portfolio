import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError } from "@/lib/api";
import { exportCampaignContacts } from "@/modules/campaigns/campaign.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE);
    const { id } = await params;
    const csv = await exportCampaignContacts(user.companyId, user.id, id);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="campanha-${id.slice(-6)}-contatos.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
