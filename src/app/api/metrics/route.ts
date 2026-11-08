import { requireRole } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { recordActivity } from "@/lib/activity";
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.object({
  campaignId: z.string(),
  metric: z.string().trim().min(2).max(60),
  value: z.number().min(0).max(1e9),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

/** Manual metric entry — always labeled source:"manual", never presented as provider-reported. */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const campaign = await prisma.campaign.findFirst({ where: { id: parsed.data.campaignId, workspaceId: ctx.workspace.id } });
  if (!campaign) return apiError("Campaign not found in this workspace.", 404);

  const metric = await prisma.campaignMetric.create({
    data: {
      workspaceId: ctx.workspace.id,
      campaignId: campaign.id,
      source: "manual",
      metric: parsed.data.metric,
      value: parsed.data.value,
      note: parsed.data.note || null,
    },
  });
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "metric",
    summary: `Manual metric recorded for "${campaign.name}": ${metric.metric} = ${metric.value}.`,
    meta: { campaignId: campaign.id, metricId: metric.id },
  });
  return json({ metric }, 201);
}
