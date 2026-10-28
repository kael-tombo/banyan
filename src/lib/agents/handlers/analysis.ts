import { prisma } from "@/lib/db";
import { canTransitionCampaign } from "@/lib/state-machines";
import { recordActivity } from "@/lib/activity";
import { summarizeObservations, type Observation } from "@/lib/learning";
import { makeLogger, safeJSON } from "@/lib/agents/handlers/common";
import type { HandlerContext, HandlerResult, TaskOutput } from "@/lib/agents/types";

/**
 * Analysis handlers: measurement (real recorded outcomes only), evidence-based
 * experiment evaluation, and evidence-backed recommendations with disclosed
 * uncertainty. These handlers complete even with true zeros — honest absence
 * of data is a valid result, never a failure to fabricate.
 */

// --- measure ---

export type MeasurementData = {
  confirmedPublications: number;
  trackedClicks: number;
  events: Record<string, number>;
  metrics: { metric: string; value: number; source: string }[];
  dataLimitations: string[];
  externalUrls: string[];
};

export async function handleMeasure(ctx: HandlerContext): Promise<HandlerResult> {
  const log = makeLogger(ctx);
  const campaignId = typeof ctx.task.inputs.campaignId === "string" ? ctx.task.inputs.campaignId : ctx.task.campaignId;

  const publications = await prisma.publication.findMany({
    where: { status: "published", contentItem: { workspaceId: ctx.workspaceId, ...(campaignId ? { campaignId } : {}) } },
    include: { contentItem: true },
    orderBy: { publishedAt: "desc" },
  });

  const links = await prisma.trackedLink.findMany({
    where: { workspaceId: ctx.workspaceId, ...(campaignId ? { campaignId } : {}) },
  });
  const linkIds = links.map((l) => l.id);
  const events = await prisma.metricEvent.groupBy({
    by: ["type"],
    where: { workspaceId: ctx.workspaceId, ...(linkIds.length ? { linkId: { in: linkIds } } : { campaignId: campaignId ?? undefined }) },
    _count: { _all: true },
  });
  const eventCounts: Record<string, number> = {};
  for (const e of events) eventCounts[e.type] = e._count._all;

  const trackedClicks = links.reduce((sum, l) => sum + l.clicks, 0);

  const metricRows = campaignId
    ? await prisma.campaignMetric.findMany({ where: { workspaceId: ctx.workspaceId, campaignId }, orderBy: { recordedAt: "desc" }, take: 20 })
    : [];

  const dataLimitations: string[] = [];
  if (publications.length === 0) {
    dataLimitations.push("No confirmed publications for this campaign yet — nothing has been measured externally.");
  }
  if (links.length === 0) {
    dataLimitations.push("No tracked links attached to this campaign — click attribution is unavailable (not zero, unmeasured).");
  }
  if (metricRows.length === 0) {
    dataLimitations.push("No provider-reported metrics recorded — platform reach/engagement is unmeasured.");
  }
  if (publications.some((p) => p.manual)) {
    dataLimitations.push("At least one publication was recorded manually; its platform-side metrics are not collected here.");
  }

  const data: MeasurementData = {
    confirmedPublications: publications.length,
    trackedClicks,
    events: eventCounts,
    metrics: metricRows.map((m) => ({ metric: m.metric, value: m.value, source: m.source })),
    dataLimitations,
    externalUrls: publications.map((p) => p.externalUrl ?? p.externalId ?? "").filter(Boolean),
  };

  // A campaign with confirmed publications is genuinely in progress.
  if (campaignId && publications.length > 0) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (campaign && canTransitionCampaign(campaign.status, "in_progress")) {
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: "in_progress", startedAt: campaign.startedAt ?? new Date() } });
      log.push("campaign", "Campaign moved to in_progress after confirmed publication.");
    }
  }

  await recordActivity({
    workspaceId: ctx.workspaceId,
    type: "metric",
    actorType: "ai",
    summary: `Measurement recorded: ${publications.length} confirmed publication(s), ${trackedClicks} tracked click(s), ${Object.entries(eventCounts).map(([k, v]) => `${v} ${k}`).join(", ") || "no first-party events"}.`,
    meta: { taskId: ctx.task.id, campaignId },
  });

  return {
    outcome: "completed",
    output: {
      summary: `Measured: ${data.confirmedPublications} publication(s), ${trackedClicks} click(s). ${dataLimitations.length} data limitation(s) recorded.`,
      data: { ...data },
    },
  };
}

// --- evaluate ---

export async function handleEvaluate(ctx: HandlerContext): Promise<HandlerResult> {
  const log = makeLogger(ctx);
  const campaignId = typeof ctx.task.inputs.campaignId === "string" ? ctx.task.inputs.campaignId : ctx.task.campaignId;
  const goal = ctx.task.goalId ? await prisma.goal.findUnique({ where: { id: ctx.task.goalId } }) : null;
  const campaign = campaignId ? await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId: ctx.workspaceId } }) : null;

  const measurement = (ctx.task.inputs.deps as { measure?: TaskOutput } | undefined)?.measure;
  const measureData = (measurement?.data ?? {}) as Partial<MeasurementData>;

  const observations: Observation[] = [
    {
      label: campaign?.name ?? "Campaign",
      clicks: measureData.trackedClicks ?? 0,
      publications: measureData.confirmedPublications ?? 0,
      metrics: (measureData.metrics ?? []).map((m) => ({ ...m, recordedAt: new Date().toISOString() })),
    },
  ];
  const runningTotals = { clicks: measureData.trackedClicks ?? 0 };
  const hypothesis = campaign?.keyMessage ?? goal?.objective ?? "the campaign hypothesis";

  const summary = summarizeObservations(hypothesis, observations, runningTotals);

  // Persist the evaluation as an Experiment record — the same honest format the
  // rest of the product uses for experiment conclusions.
  const experiment = await prisma.experiment.create({
    data: {
      workspaceId: ctx.workspaceId,
      campaignId: campaignId ?? null,
      title: `Evaluation: ${campaign?.name ?? goal?.objective ?? "distribution wave"}`.slice(0, 160),
      hypothesis,
      audience: campaign?.targetAudience ?? null,
      channel: (safeJSON<string[]>(campaign?.channels ?? "[]", [])[0] as string) ?? null,
      variable: "Message + channel focus (first wave)",
      successMetric: goal?.successMetric ?? campaign?.successMetric ?? "signups",
      status: "complete",
      results: summary.observations.join(" | ").slice(0, 2000),
      interpretation: summary.interpretationDraft,
      limitations: [summary.limitationsDraft, ...(measureData.dataLimitations ?? [])].filter(Boolean).join(" ").slice(0, 2000),
      nextAction: summary.nextActionDraft,
      metricsSnapshot: JSON.stringify({
        confirmedPublications: measureData.confirmedPublications ?? 0,
        trackedClicks: measureData.trackedClicks ?? 0,
        events: measureData.events ?? {},
        metrics: measureData.metrics ?? [],
      }),
      decidedAt: new Date(),
    },
  });
  log.push("experiment", `Evaluation recorded as experiment ${experiment.id} (verdict: ${summary.verdict}).`);

  await recordActivity({
    workspaceId: ctx.workspaceId,
    type: "experiment_update",
    actorType: "ai",
    summary: `Experiment evaluated: verdict "${summary.verdict.replace(/_/g, " ")}" based on recorded observations only.`,
    meta: { taskId: ctx.task.id, experimentId: experiment.id },
  });

  return {
    outcome: "completed",
    output: {
      summary: `Evaluation complete — verdict: ${summary.verdict}. ${summary.interpretationDraft.slice(0, 200)}`,
      refs: { experimentId: experiment.id },
      data: { experimentId: experiment.id, verdict: summary.verdict, observations: summary.observations },
    },
  };
}

// --- recommend ---

const HIGH_CONFIDENCE_SIGNUPS = 10;
const HIGH_CONFIDENCE_CLICKS = 100;
const MEDIUM_CONFIDENCE_CLICKS = 30;

/** Pure confidence policy: evidence thresholds decide, never vibes. */
export function recommendationConfidence(input: { signups: number; clicks: number; publications: number; evidenceCount: number }): { confidence: "low" | "medium" | "high"; uncertainty: string } {
  if (input.signups >= HIGH_CONFIDENCE_SIGNUPS || input.clicks >= HIGH_CONFIDENCE_CLICKS) {
    return {
      confidence: "high",
      uncertainty: "First-party volume is material, but attribution is still first-touch and uncontrolled; treat the direction as more reliable than the exact size of the effect.",
    };
  }
  if (input.clicks >= MEDIUM_CONFIDENCE_CLICKS || (input.publications > 0 && input.evidenceCount > 0)) {
    return {
      confidence: "medium",
      uncertainty: `Moderate sample (${input.clicks} tracked clicks, ${input.signups} attributed signups). No control group; correlations may not survive scale.`,
    };
  }
  return {
    confidence: "low",
    uncertainty: input.evidenceCount === 0
      ? "No measured outcomes exist yet — this recommendation is grounded in workflow state and context, not results. Collect data before treating it as evidence-based."
      : `Very small sample (${input.clicks} tracked clicks, ${input.signups} attributed signups). Evidence is thin; treat as directional only.`,
  };
}

export async function handleRecommend(ctx: HandlerContext): Promise<HandlerResult> {
  const log = makeLogger(ctx);
  const campaignId = typeof ctx.task.inputs.campaignId === "string" ? ctx.task.inputs.campaignId : ctx.task.campaignId;
  const goal = ctx.task.goalId ? await prisma.goal.findUnique({ where: { id: ctx.task.goalId } }) : null;

  const measurement = (ctx.task.inputs.deps as { measure?: TaskOutput } | undefined)?.measure;
  const evaluation = (ctx.task.inputs.deps as { evaluate?: TaskOutput } | undefined)?.evaluate;
  const measureData = (measurement?.data ?? {}) as Partial<MeasurementData>;
  const verdict = String(evaluation?.data?.verdict ?? "not_enough_data");
  const experimentId = String(evaluation?.refs?.experimentId ?? "");

  const signups = measureData.events?.signup ?? 0;
  const clicks = measureData.trackedClicks ?? 0;
  const publications = measureData.confirmedPublications ?? 0;

  // Evidence items cite real recorded rows — each entry names its source.
  const evidence: { source: string; ref: string; summary: string }[] = [];
  if (publications > 0) {
    evidence.push({ source: "publications", ref: campaignId ?? "workspace", summary: `${publications} provider-confirmed publication(s) recorded for this campaign.` });
  }
  if (clicks > 0) {
    evidence.push({ source: "tracked_links", ref: campaignId ?? "workspace", summary: `${clicks} tracked click(s) recorded via first-party links.` });
  }
  if (signups > 0) {
    evidence.push({ source: "metric_events", ref: "signup", summary: `${signups} signup event(s) attributed via visitor cookie (first-touch).` });
  }
  if (experimentId) {
    evidence.push({ source: "experiment", ref: experimentId, summary: `Experiment evaluation verdict: ${verdict.replace(/_/g, " ")}.` });
  }
  if (measureData.dataLimitations?.length) {
    evidence.push({ source: "data_limitations", ref: "measurement", summary: measureData.dataLimitations.join(" ") });
  }

  const { confidence, uncertainty } = recommendationConfidence({ signups, clicks, publications, evidenceCount: evidence.length });

  // The recommended action follows the evidence honestly.
  let title: string;
  let rationale: string;
  if (publications === 0) {
    title = "Complete the publishing step before drawing conclusions";
    rationale = campaignId
      ? "No confirmed publication exists for this campaign, so no external outcome can be measured yet. Configure a publishing connection or record a manual publication, then let the workflow measure real results."
      : "No confirmed publications exist yet. Publishing (or recording a manual publication with its live URL) is the prerequisite for any measured recommendation.";
  } else if (verdict === "not_enough_data") {
    title = "Keep the current message running to collect enough evidence";
    rationale = `The evaluation returned "not enough data" with ${clicks} tracked click(s). The current wave is live (${publications} publication(s)); changing course now would reset measurement before a readable signal exists.`;
  } else if (verdict === "evidence_for" || confidence === "high") {
    title = "Scale the validated message to the next channel";
    rationale = `Recorded outcomes (${clicks} tracked clicks, ${signups} attributed signups, verdict: ${verdict.replace(/_/g, " ")}) support continuing. Expand to a second channel while keeping the same message and metric so results stay comparable.`;
  } else {
    title = "Run one focused follow-up experiment with a pre-declared threshold";
    rationale = `Verdict "${verdict.replace(/_/g, " ")}" with ${clicks} tracked click(s). Define one variable and a success threshold in advance, then re-measure — per the evaluation's recorded next action.`;
  }

  const recommendation = await prisma.recommendation.create({
    data: {
      workspaceId: ctx.workspaceId,
      goalId: ctx.task.goalId,
      campaignId: campaignId ?? null,
      experimentId: experimentId || null,
      title,
      rationale,
      evidence: JSON.stringify(evidence),
      confidence,
      uncertainty,
      status: "open",
      producedBy: `task:${ctx.task.id}`,
    },
  });
  log.push("recommendation", `Stored recommendation with ${evidence.length} evidence item(s), confidence ${confidence}.`);

  await recordActivity({
    workspaceId: ctx.workspaceId,
    type: "task",
    actorType: "ai",
    summary: `Next action recommended (confidence: ${confidence}): ${title}`,
    meta: { taskId: ctx.task.id, recommendationId: recommendation.id },
  });

  return {
    outcome: "completed",
    output: {
      summary: `Recommendation stored (confidence ${confidence}): ${title}`,
      refs: { recommendationId: recommendation.id },
      data: { recommendationId: recommendation.id, confidence },
    },
  };
}
