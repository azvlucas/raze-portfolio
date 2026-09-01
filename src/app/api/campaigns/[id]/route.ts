import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { z } from "zod";
import {
  getCampaign,
  markCampaignCompleted,
  updateCampaignStatus,
} from "@/modules/campaigns/campaign.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.CAMPAIGNS_VIEW);
    const { id } = await params;
    const campaign = await getCampaign(user.companyId, id);
    if (!campaign) return jsonError("Campanha não encontrada", 404);
    return jsonOk(campaign);
  } catch (error) {
    return handleApiError(error);
  }
}

const statusSchema = z.object({
  action: z.enum(["ready", "complete", "cancel"]),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE);
    const { id } = await params;
    const body = statusSchema.parse(await request.json());

    if (body.action === "complete") {
      const updated = await markCampaignCompleted(user.companyId, user.id, id);
      return jsonOk(updated);
    }
    if (body.action === "ready") {
      const updated = await updateCampaignStatus(
        user.companyId,
        user.id,
        id,
        "READY",
      );
      return jsonOk(updated);
    }
    if (body.action === "cancel") {
      const updated = await updateCampaignStatus(
        user.companyId,
        user.id,
        id,
        "CANCELLED",
      );
      return jsonOk(updated);
    }

    return jsonError("Ação inválida", 400);
  } catch (error) {
    return handleApiError(error);
  }
}
