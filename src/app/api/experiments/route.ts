import { requireRole } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { summarizeObservations } from "@/lib/learning";
import { recordActivity } from "@/lib/activity";
import { NextRequest } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().trim().min(3).max(140),
  hypothesis: z.string().trim().min(10).max(1000),
  audience: z.string().trim().max(300).optional().or(z.literal("")),
  channel: z.enum(["x", "linkedin", "shortvideo"]).optional().or(z.literal("")),
  variable: z.string().trim().min(3).max(300),
  campaignId: z.string().nullable().optional(),
  successMetric: z.string().trim().min(3).max(200),
});

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const experiments = await prisma.experiment.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { updatedAt: "desc" },
  });
  return json({ experiments });
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const parsed = await readJson(req, createSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  if (parsed.data.campaignId) {
    const campaign = await prisma.campaign.findFirst({ where: { id: parsed.data.campaignId, workspaceId: ctx.workspace.id } });
    if (!campaign) return apiError("Campaign not found in this workspace.", 404);
  }

  const experiment = await prisma.experiment.create({
    data: {
      workspaceId: ctx.workspace.id,
      title: parsed.data.title,
      hypothesis: parsed.data.hypothesis,
      audience: parsed.data.audience || null,
      channel: parsed.data.channel || null,
      variable: parsed.data.variable,
      campaignId: parsed.data.campaignId ?? null,
      successMetric: parsed.data.successMetric,
      status: "planned",
    },
  });
  await recordActivity({ workspaceId: ctx.workspace.id, type: "experiment_update", summary: `Experiment "${experiment.title}" created (planned).`, meta: { experimentId: experiment.id } });
  return json({ experiment }, 201);
}
