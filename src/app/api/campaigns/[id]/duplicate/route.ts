import { requireRole } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace } from "@/lib/api-utils";
import { recordActivity } from "@/lib/activity";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;
  const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!campaign) return apiError("Campaign not found.", 404);

  const { id: _omit, createdAt, updatedAt, ...rest } = campaign;
  const copy = await prisma.campaign.create({
    data: {
      ...rest,
      name: `${campaign.name} (copy)`,
      status: "draft",
      startedAt: null,
      completedAt: null,
    },
  });
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "campaign",
    summary: `Campaign "${campaign.name}" duplicated as "${copy.name}".`,
    meta: { sourceId: campaign.id, campaignId: copy.id },
  });
  return json({ campaign: copy }, 201);
}
