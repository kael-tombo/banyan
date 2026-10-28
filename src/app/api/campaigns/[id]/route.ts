import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { recordActivity } from "@/lib/activity";
import { canTransitionCampaign } from "@/lib/state-machines";
import { NextRequest } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  objective: z.string().trim().min(3).max(200).optional(),
  targetAudience: z.string().trim().min(3).max(300).optional(),
  keyMessage: z.string().trim().min(10).max(1000).optional(),
  evidence: z.string().trim().max(2000).optional(),
  cta: z.string().trim().min(3).max(200).optional(),
  channels: z.array(z.enum(["x", "linkedin", "shortvideo"])).min(1).max(3).optional(),
  formats: z.array(z.string().max(50)).min(1).max(10).optional(),
  schedule: z.record(z.string()).optional(),
  successMetric: z.string().trim().min(3).max(200).optional(),
  status: z.enum(["draft", "planned", "in_progress", "completed", "archived"]).optional(),
});

async function loadCampaign(id: string, workspaceId: string) {
  return prisma.campaign.findFirst({ where: { id, workspaceId } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const campaign = await loadCampaign(id, ctx.workspace.id);
  if (!campaign) return apiError("Campaign not found.", 404);
  const items = await prisma.contentItem.findMany({ where: { campaignId: campaign.id }, orderBy: { createdAt: "desc" } });
  return json({ campaign, items, channels: JSON.parse(campaign.channels), formats: JSON.parse(campaign.formats), schedule: JSON.parse(campaign.schedule) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const campaign = await loadCampaign(id, ctx.workspace.id);
  if (!campaign) return apiError("Campaign not found.", 404);

  const parsed = await readJson(req, patchSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  if (parsed.data.status && !canTransitionCampaign(campaign.status, parsed.data.status)) {
    return apiError(`Invalid campaign status transition: ${campaign.status} → ${parsed.data.status}.`, 400);
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.channels) data.channels = JSON.stringify(parsed.data.channels);
  if (parsed.data.formats) data.formats = JSON.stringify(parsed.data.formats);
  if (parsed.data.schedule) data.schedule = JSON.stringify(parsed.data.schedule);
  if (parsed.data.status === "in_progress") data.startedAt = campaign.startedAt ?? new Date();
  if (parsed.data.status === "completed") data.completedAt = new Date();

  const updated = await prisma.campaign.update({ where: { id: campaign.id }, data });
  if (parsed.data.status) {
    await recordActivity({
      workspaceId: ctx.workspace.id,
      type: "campaign",
      summary: `Campaign "${campaign.name}" moved from ${campaign.status} to ${parsed.data.status}.`,
      meta: { campaignId: campaign.id },
    });
  }
  return json({ campaign: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Deliberately not exposed: campaigns archive instead of delete (audit trail preserved).
  return apiError("Campaigns are archived, not deleted. Use the archive action.", 405);
}
