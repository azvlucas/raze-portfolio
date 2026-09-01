import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, jsonOk } from "@/lib/api";
import { z } from "zod";
import { segmentFiltersSchema } from "@/modules/crm/crm.schema";
import { previewSegment } from "@/modules/campaigns/campaign.service";

const schema = z.object({
  channel: z.enum(["WHATSAPP", "EMAIL", "INSTAGRAM", "OTHER"]).default("WHATSAPP"),
  segmentKey: z.string().optional().nullable(),
  segmentFilters: segmentFiltersSchema.optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.CAMPAIGNS_VIEW);
    const body = schema.parse(await request.json());
    const preview = await previewSegment(
      user.companyId,
      {
        ...(body.segmentFilters ?? {}),
        quick: (body.segmentKey as never) || "all",
      },
      body.channel,
    );
    return jsonOk(preview);
  } catch (error) {
    return handleApiError(error);
  }
}
