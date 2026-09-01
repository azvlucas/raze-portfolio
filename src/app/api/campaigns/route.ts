import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonCreated, jsonOk } from "@/lib/api";
import {
  campaignListQuerySchema,
  campaignSchema,
} from "@/modules/crm/crm.schema";
import {
  createCampaign,
  listCampaigns,
} from "@/modules/campaigns/campaign.service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.CAMPAIGNS_VIEW);
    const { searchParams } = new URL(request.url);
    const query = campaignListQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    return jsonOk(await listCampaigns(user.companyId, query));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE);
    const data = campaignSchema.parse(await request.json());
    const campaign = await createCampaign(user.companyId, user.id, data);
    return jsonCreated(campaign);
  } catch (error) {
    return handleApiError(error);
  }
}
