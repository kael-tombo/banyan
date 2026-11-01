import { z } from "zod";
import { prisma } from "@/lib/db";
import { canTransitionGoal } from "@/lib/state-machines";
import { recordActivity } from "@/lib/activity";
import { contextBlock, loadBusinessContext, routedStructured } from "@/lib/agents/handlers/common";
import type { HandlerResult } from "@/lib/agents/types";
import type { ParsedGoal } from "@/lib/agents/nl-goal";
import { parseChannelConstraint } from "@/lib/agents/channels";
import type { Channel } from "@/lib/formats";

/**
 * Planning-phase handlers: plan drafting (with human approval gate),
 * hypothesis-framed research, and channel strategy.
 */

// --- plan_draft ---

const PLAN_OUTPUT = z.object({
  summary: z.string().min(10).max(1200),
  assumptions: z.array(z.string().min(3)).max(8),
  missingInfo: z.array(z.string().min(3)).max(8),
  risks: z.array(z.string().min(3)).max(6),
  phases: z.array(z.object({ name: z.string().min(2), description: z.string().min(3), taskTypes: z.array(z.string()).max(6) })).max(5),
});

export type PlanDraft = z.infer<typeof PLAN_OUTPUT>;

export async function handlePlanDraft(ctx: import("@/lib/agents/types").HandlerContext): Promise<HandlerResult> {
  const goalId = ctx.task.goalId;
  if (!goalId) return { outcome: "failed", error: "plan_draft task has no goal.", retryable: false };
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) return { outcome: "failed", error: "Goal not found.", retryable: false };

  const biz = await loadBusinessContext(ctx.workspaceId);
  const parsed = ctx.task.inputs.parsed as ParsedGoal | undefined;

  const system = [
    "You are Banyan.ai's execution planner. You turn a founder's goal into an honest, testable execution plan for a distribution-first workflow.",
    "Rules:",
    "- Every claim about the market or audience is an assumption to validate, never a fact.",
    "- missingInfo MUST list what you would need to know (baselines, access, budget) — this is shown to the user before approval.",
    "- Do not promise outcomes. Phases map to the workflow: research, strategy, campaign_plan, content_draft, approval_gate, publish, measure, evaluate, recommend.",
    'Respond with ONLY JSON: {"summary": string, "assumptions": [string], "missingInfo": [string], "risks": [string], "phases": [{"name": string, "description": string, "taskTypes": [string]}]}',
  ].join("\n");

  const user = [
    `Goal (verbatim from the user): ${goal.rawInput || goal.objective}`,
    goal.description ? `Additional description: ${goal.description}` : "",
    `Parsed structure: metric=${goal.successMetric}, target=${goal.metricTarget ?? "not specified"}, deadline=${goal.deadline?.toISOString().slice(0, 10) ?? "none"}, constraints=${goal.constraints || "none"}`,
    parsed ? `Heuristic parse notes: channels=${parsed.channels.join(",") || "none mentioned"}` : "",
    "",
    contextBlock(biz, { objective: goal.objective, successMetric: goal.successMetric, metricTarget: goal.metricTarget, deadline: goal.deadline, constraints: goal.constraints }),
  ].filter(Boolean).join("\n");

  const { data, label, isFallback } = await routedStructured({
    workspaceId: ctx.workspaceId,
    purpose: "plan_draft",
    system,
    user,
    maxTokens: 1400,
    temperature: 0.5,
    schema: PLAN_OUTPUT,
    template: () => templatePlanDraft(goal, biz),
  });

  // Supersede any previous plan (e.g. after a rejection + regenerate).
  await prisma.goalPlan.updateMany({ where: { goalId, status: "planned" }, data: { status: "superseded" } });
  const plan = await prisma.goalPlan.upsert({
    where: { goalId },
    create: {
      goalId,
      summary: data.summary,
      assumptions: JSON.stringify(data.assumptions),
      missingInfo: JSON.stringify(data.missingInfo),
      risks: JSON.stringify(data.risks),
      phases: JSON.stringify(data.phases),
      status: "planned",
      generatedMeta: JSON.stringify({ label, isFallback }),
    },
    update: {
      summary: data.summary,
      assumptions: JSON.stringify(data.assumptions),
      missingInfo: JSON.stringify(data.missingInfo),
      risks: JSON.stringify(data.risks),
      phases: JSON.stringify(data.phases),
      status: "planned",
      approvedById: null,
      approvedAt: null,
      rejectedReason: null,
      generatedMeta: JSON.stringify({ label, isFallback }),
    },
  });

  if (canTransitionGoal(goal.status, "awaiting_approval")) {
    await prisma.goal.update({ where: { id: goal.id }, data: { status: "awaiting_approval" } });
  }
  await recordActivity({
    workspaceId: ctx.workspaceId,
    type: "goal",
    actorType: "ai",
    summary: `Plan drafted for "${goal.objective}" — awaiting your approval before any execution.`,
    meta: { goalId: goal.id, planId: plan.id, isFallback },
  });

  // The plan itself now needs a human decision; this task stays in
  // waiting_approval until the user approves or rejects it.
  return {
    outcome: "waiting_approval",
    note: `Plan drafted (${label}). Awaiting human approval before consequential actions.`,
    // planId is persisted with the waiting_approval output so approvers can reference it.
    // (HandlerResult carries it via the orchestrator's output-on-wait path.)
  } satisfies HandlerResult & { note: string };
}

/** Deterministic, honest plan when no live model is available. */
export function templatePlanDraft(
  goal: { objective: string; successMetric: string; metricTarget: number | null; deadline: Date | null; constraints: string },
  biz: { profile: { name?: string; audience?: string | null; audiencePain?: string | null } | null }
): PlanDraft {
  const product = biz.profile?.name || "your product";
  const audience = biz.profile?.audience || "your target audience";
  return {
    summary: `Hypothesis-framed plan for "${goal.objective}". Run one complete distribution loop: research angles from your recorded context, draft a channel strategy, launch one campaign with a single message, draft channel-specific content, wait for your approval, publish through configured integrations (or record manual publications), then measure real outcomes and evaluate. Success is measured as ${goal.successMetric}${goal.metricTarget != null ? ` with target ${goal.metricTarget}` : " (no numeric target set yet)"}.`,
    assumptions: [
      `Assumption: ${audience} can be reached on X, LinkedIn or short-form video.`,
      `Assumption: ${product}'s current positioning is clear enough to draft testable messages.`,
      goal.metricTarget == null ? "Assumption: the metric target is missing — approve a number before evaluation." : `Assumption: target ${goal.metricTarget} ${goal.successMetric} is the right bar for this cycle.`,
    ],
    missingInfo: [
      "Baseline for the success metric (current value, source, date) — needed to state progress honestly.",
      goal.deadline ? null : "A deadline, so pacing and urgency are real rather than implied.",
      "Which publishing path is available (SocialFlow.ai once verified, or export mode with manual publication recording).",
    ].filter((s): s is string => !!s),
    risks: [
      "Without an approved plan no consequential action runs — the workflow waits.",
      "Publishing without a configured connection is recorded as blocked, not performed.",
    ],
    phases: [
      { name: "Research", description: "Hypothesis-framed questions and angles from recorded context.", taskTypes: ["research"] },
      { name: "Strategy", description: "Positioning and channel focus as hypotheses.", taskTypes: ["strategy"] },
      { name: "Campaign", description: "One campaign: one message, one audience, a declared metric.", taskTypes: ["campaign_plan", "content_draft"] },
      { name: "Approval & publish", description: "Human approval, then provider-confirmed publishing or honest blocked state.", taskTypes: ["approval_gate", "publish"] },
      { name: "Learn", description: "Measure real outcomes, evaluate, recommend next action with evidence.", taskTypes: ["measure", "evaluate", "recommend"] },
    ],
  };
}

// --- research ---

const RESEARCH_OUTPUT = z.object({
  questions: z.array(z.string().min(5)).min(1).max(10),
  hypothesisAngles: z.array(z.string().min(10)).min(1).max(6),
  sourcesNeeded: z.array(z.string()).max(10).default([]),
  labelledAs: z.literal("hypothesis").default("hypothesis"),
});

export type ResearchBrief = z.infer<typeof RESEARCH_OUTPUT>;

export async function handleResearch(ctx: import("@/lib/agents/types").HandlerContext): Promise<HandlerResult> {
  const goal = ctx.task.goalId ? await prisma.goal.findUnique({ where: { id: ctx.task.goalId } }) : null;
  const biz = await loadBusinessContext(ctx.workspaceId);

  const system = [
    "You are Banyan.ai's research agent. You DO NOT have live web access in this deployment.",
    "Produce a research brief the founder can validate by hand: sharp questions, testable hypothesis angles about the audience and channels, and the sources that would settle them.",
    "Never state market facts, statistics or competitor results — you have none. Everything is labelled a hypothesis.",
    'Respond with ONLY JSON: {"questions": [string], "hypothesisAngles": [string], "sourcesNeeded": [string], "labelledAs": "hypothesis"}',
  ].join("\n");

  const user = contextBlock(biz, goal ? { objective: goal.objective, successMetric: goal.successMetric, metricTarget: goal.metricTarget, deadline: goal.deadline, constraints: goal.constraints } : null);

  const { data, label, isFallback } = await routedStructured({
    workspaceId: ctx.workspaceId,
    purpose: "research",
    system,
    user,
    maxTokens: 900,
    temperature: 0.6,
    schema: RESEARCH_OUTPUT,
    template: () => templateResearchBrief(biz, goal),
  });

  // Persist the angles as inspectable business context with hypothesis provenance.
  let persisted = 0;
  for (let i = 0; i < Math.min(3, data.hypothesisAngles.length); i++) {
    const key = `angle:${ctx.task.id.slice(-6)}:${i}`;
    try {
      await prisma.profileFact.upsert({
        where: { workspaceId_category_key: { workspaceId: ctx.workspaceId, category: "research", key } },
        create: {
          workspaceId: ctx.workspaceId,
          category: "research",
          key,
          value: data.hypothesisAngles[i],
          provenance: "hypothesis",
          confidence: "low",
          source: `task:${ctx.task.id}`,
          createdBy: `task:${ctx.task.id}`,
        },
        update: { value: data.hypothesisAngles[i], source: `task:${ctx.task.id}` },
      });
      persisted++;
    } catch {
      /* keep the workflow running even if a fact row conflicts */
    }
  }
  await recordActivity({
    workspaceId: ctx.workspaceId,
    type: "task",
    actorType: "ai",
    summary: `Research brief produced (${data.hypothesisAngles.length} hypothesis angle(s), ${persisted} stored as context) — ${label}.`,
    meta: { taskId: ctx.task.id, goalId: ctx.task.goalId },
  });

  return {
    outcome: "completed",
    output: {
      summary: `Research brief: ${data.questions.length} question(s), ${data.hypothesisAngles.length} hypothesis angle(s). All content labelled hypothesis — no live market data was available.`,
      data: { ...data },
      generatedLabel: label,
      isFallback,
    },
  };
}

export function templateResearchBrief(
  biz: { profile: { audience?: string | null; audiencePain?: string | null; valueProp?: string | null } | null },
  goal: { objective: string; successMetric: string } | null
): ResearchBrief {
  const audience = biz.profile?.audience || "the target audience";
  const pain = biz.profile?.audiencePain || "the stated pain point";
  return {
    questions: [
      `Where does ${audience} already discuss ${pain} — which exact communities, hashtags or newsletters?`,
      `What language does ${audience} use to describe ${pain} (verbatim phrases to reuse)?`,
      `What would make ${audience} distrust a claim about this problem?`,
    ],
    hypothesisAngles: [
      `Hypothesis: ${audience} responds more to problem-first framing than product-first framing for ${pain}.`,
      `Hypothesis: the current value proposition undersells the outcome; leading with the outcome will outperform.`,
      goal ? `Hypothesis: ${goal.successMetric} responds to consistency (cadence) more than to polish.` : "Hypothesis: cadence beats polish for early distribution.",
    ],
    sourcesNeeded: [
      "5-10 real community threads or posts where the audience discusses the problem (collect manually).",
      "Baseline metric from your own analytics before the campaign starts.",
    ],
    labelledAs: "hypothesis",
  };
}

// --- strategy ---

const STRATEGY_OUTPUT = z.object({
  positioning: z.string().min(10),
  contentThemes: z.array(z.string().min(5)).min(1).max(5),
  channelFocus: z.array(z.enum(["x", "linkedin", "shortvideo"])).min(1).max(3),
  rationale: z.string().min(10),
  labelledAs: z.literal("hypothesis").default("hypothesis"),
});

export type StrategyOutput = z.infer<typeof STRATEGY_OUTPUT>;

export async function handleStrategy(ctx: import("@/lib/agents/types").HandlerContext): Promise<HandlerResult> {
  const goal = ctx.task.goalId ? await prisma.goal.findUnique({ where: { id: ctx.task.goalId } }) : null;
  const biz = await loadBusinessContext(ctx.workspaceId);
  const researchBrief =
    (ctx.task.inputs.deps as { research?: { data?: ResearchBrief } } | undefined)?.research?.data ?? null;
  // A complete cycle begins with the channels the founder selected. The model
  // may propose a focus, but it may never silently drop a required channel.
  const requiredChannels = parseChannelConstraint(goal?.constraints ?? "");

  const system = [
    "You are Banyan.ai's strategy agent. Draft ONE positioning hypothesis and the smallest viable channel focus for the first campaign wave.",
    "Channels available: x, linkedin, shortvideo. Respect the user's constraints. No invented evidence.",
    "If the human explicitly selected channels in the constraints, choose exactly those channels and no others.",
    'Respond with ONLY JSON: {"positioning": string, "contentThemes": [string], "channelFocus": [channel], "rationale": string, "labelledAs": "hypothesis"}',
  ].join("\n");

  const user = [
    contextBlock(biz, goal ? { objective: goal.objective, successMetric: goal.successMetric, metricTarget: goal.metricTarget, deadline: goal.deadline, constraints: goal.constraints } : null),
    requiredChannels.length > 0 ? `Channels required by the human: ${requiredChannels.join(", ")}. Use exactly these.` : "",
    researchBrief ? `Research brief to build on (hypotheses): ${researchBrief.hypothesisAngles.join(" | ")}` : "",
  ].filter(Boolean).join("\n");

  const { data, label, isFallback } = await routedStructured({
    workspaceId: ctx.workspaceId,
    purpose: "strategy",
    system,
    user,
    maxTokens: 900,
    temperature: 0.6,
    schema: STRATEGY_OUTPUT,
    template: () => templateStrategy(biz, goal, requiredChannels),
  });

  const channelFocus = requiredChannels.length > 0 ? requiredChannels : data.channelFocus;

  // Persist the positioning hypothesis as inspectable context.
  await prisma.profileFact.upsert({
    where: { workspaceId_category_key: { workspaceId: ctx.workspaceId, category: "positioning", key: `strategy:${ctx.task.goalId ?? "standalone"}` } },
    create: {
      workspaceId: ctx.workspaceId,
      category: "positioning",
      key: `strategy:${ctx.task.goalId ?? "standalone"}`,
      value: data.positioning,
      provenance: "hypothesis",
      confidence: "low",
      source: `task:${ctx.task.id}`,
      createdBy: `task:${ctx.task.id}`,
    },
    update: { value: data.positioning, source: `task:${ctx.task.id}` },
  }).catch(() => {});

  return {
    outcome: "completed",
    output: {
      summary: `Strategy drafted: focus on ${channelFocus.join(", ")} — ${data.positioning.slice(0, 160)}`,
      data: { ...data, channelFocus },
      refs: {},
      generatedLabel: label,
      isFallback,
    },
  };
}

export function templateStrategy(
  biz: { profile: { audience?: string | null; audiencePain?: string | null; name?: string | null } | null },
  goal: { successMetric: string; constraints: string } | null,
  requiredChannels: Channel[] = []
): StrategyOutput {
  const audience = biz.profile?.audience || "the target audience";
  const pain = biz.profile?.audiencePain || "the core problem";
  const paid = /paid|budget/i.test(goal?.constraints ?? "");
  const fallbackChannels: StrategyOutput["channelFocus"] = paid ? ["linkedin"] : ["x", "linkedin"];
  const channelFocus: StrategyOutput["channelFocus"] =
    requiredChannels.length > 0 ? requiredChannels : fallbackChannels;
  return {
    positioning: `Hypothesis: ${audience} needs a direct, problem-first articulation of ${pain} — and the product is credible precisely because it shows its work instead of promising results.`,
    contentThemes: [
      `Hypothesis theme: the real cost of ${pain} for ${audience}`,
      "Hypothesis theme: building in public — what we shipped and what we learned",
      "Hypothesis theme: small experiments with honestly reported results",
    ],
    channelFocus,
    rationale: requiredChannels.length > 0
      ? `The human selected ${channelFocus.join(", ")} for this cycle; the wave respects that selection.`
      : paid
        ? "Constraint mentions paid spend limits; LinkedIn suits a focused, low-volume, high-trust wave."
        : "Starting with text channels where iteration is fastest; short-form video joins once a message shows signal.",
    labelledAs: "hypothesis",
  };
}
