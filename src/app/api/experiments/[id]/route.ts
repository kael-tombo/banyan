import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { summarizeObservations } from "@/lib/learning";
import { recordActivity } from "@/lib/activity";
import { NextRequest } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().trim().min(3).max(140).optional(),
  hypothesis: z.string().trim().min(10).max(1000).optional(),
  variable: z.string().trim().min(3).max(300).optional(),
  successMetric: z.string().trim().min(3).max(200).optional(),
  status: z.enum(["planned", "running", "complete", "abandoned"]).optional(),
  results: z.string().max(4000).optional().nullable(),
  interpretation: z.string().max(4000).optional().nullable(),
  limitations: z.string().max(4000).optional().nullable(),
  nextAction: z.string().max(1000).optional().nullable(),
  action: z.enum(["draft_conclusions"]).optional(),
});

async function collectObservations(workspaceId: string, campaignId: string | null, channel: string | null) {
  const clicks = await prisma.trackedLink.aggregate({
    where: { workspaceId, campaignId: campaignId ?? undefined },
    _sum: { clicks: true },
  });
  const publications = campaignId
    ? await prisma.publication.count({ where: { contentItem: { campaignId, workspaceId }, status: "published" } })
    : await prisma.publication.count({ where: { contentItem: { workspaceId }, status: "published" } });
  const metrics = campaignId
    ? await prisma.campaignMetric.findMany({ where: { campaignId, workspaceId }, orderBy: { recordedAt: "desc" }, take: 10 })
    : [];
  return {
    clickTotal: clicks._sum.clicks ?? 0,
    publications,
    metrics: metrics.map((m) => ({ metric: m.metric, value: m.value, source: m.source, recordedAt: m.recordedAt.toISOString() })),
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const experiment = await prisma.experiment.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!experiment) return apiError("Experiment not found.", 404);
  const obs = await collectObservations(ctx.workspace.id, experiment.campaignId, experiment.channel);
  const summary = summarizeObservations(experiment.hypothesis, [
    {
      label: "Recorded outcomes",
      clicks: obs.clickTotal,
      publications: obs.publications,
      metrics: obs.metrics,
    },
  ], { clicks: obs.clickTotal });
  return json({ experiment, observation: { ...obs }, summary });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const experiment = await prisma.experiment.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!experiment) return apiError("Experiment not found.", 404);

  const parsed = await readJson(req, patchSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  let data: Record<string, unknown> = { ...parsed.data };
  delete data.action;

  // Auto-generate conclusions ONLY from actually recorded data.
  if (parsed.data.action === "draft_conclusions") {
    const obs = await collectObservations(ctx.workspace.id, experiment.campaignId, experiment.channel);
    const summary = summarizeObservations(experiment.hypothesis, [
      {
        label: "Recorded outcomes",
        clicks: obs.clickTotal,
        publications: obs.publications,
        metrics: obs.metrics,
      },
    ], { clicks: obs.clickTotal });
    data = {
      ...data,
      status: parsed.data.status ?? "complete",
      results: summary.observations.join("\n"),
      interpretation: summary.interpretationDraft,
      limitations: summary.limitationsDraft,
      nextAction: summary.nextActionDraft,
      metricsSnapshot: JSON.stringify(obs),
      decidedAt: new Date(),
    };
  }

  if (data.status && data.status === "complete" && !data.decidedAt) data.decidedAt = new Date();

  const updated = await prisma.experiment.update({ where: { id: experiment.id }, data });
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "experiment_update",
    summary: parsed.data.action === "draft_conclusions"
      ? `Experiment "${experiment.title}" conclusions drafted from recorded data and saved for review.`
      : `Experiment "${experiment.title}" updated.`,
    meta: { experimentId: experiment.id },
  });
  return json({ experiment: updated });
}
