import { TASK_ROLE, type TaskType } from "@/lib/state-machines";
import type { VerificationCriteria } from "@/lib/agents/types";

/**
 * Workflow template for the distribution loop:
 *   business context → plan approval (human) → research → strategy →
 *   campaign plan → channel content → human approval → publishing →
 *   measurement → experiment evaluation → next recommendation.
 *
 * The first four slots are created statically with stable dedupe keys so
 * retries/resumptions never duplicate tasks. Later stages (content drafts,
 * approval gates, publishes, measurement, evaluation, recommendation) are
 * created dynamically by their predecessor on success — also with stable
 * dedupe keys — so a crashed or retried workflow converges to the same shape.
 */

export type TaskSpec = {
  dedupeKey: string;
  type: TaskType;
  title: string;
  agentRole: string;
  status: "pending" | "ready";
  inputs: Record<string, unknown>;
  expectedOutput: string;
  verification: VerificationCriteria;
  requiresApproval: boolean;
  dependsOn: string[]; // dedupe keys of dependencies; resolved to ids by the orchestrator
  maxAttempts: number;
};

export function initialDistributionTasks(goalId: string): TaskSpec[] {
  const key = (slot: string) => `goal:${goalId}:${slot}`;
  return [
    {
      dedupeKey: key("plan_draft"),
      type: "plan_draft",
      title: "Draft the execution plan for review",
      agentRole: TASK_ROLE.plan_draft,
      status: "ready",
      inputs: {},
      expectedOutput: "A structured plan with summary, assumptions, missing information and risks; requires human approval before any consequential action.",
      verification: { kind: "json_schema", schema: "plan_draft" },
      requiresApproval: true,
      dependsOn: [],
      maxAttempts: 3,
    },
    {
      dedupeKey: key("research"),
      type: "research",
      title: "Research angles and open questions",
      agentRole: TASK_ROLE.research,
      status: "pending",
      inputs: {},
      expectedOutput: "Hypothesis-framed research brief: questions, angles, sources needed. Clearly labelled as hypotheses — no fabricated market data.",
      verification: { kind: "json_schema", schema: "research_brief" },
      requiresApproval: false,
      dependsOn: [key("plan_draft")],
      maxAttempts: 3,
    },
    {
      dedupeKey: key("strategy"),
      type: "strategy",
      title: "Positioning and channel strategy",
      agentRole: TASK_ROLE.strategy,
      status: "pending",
      inputs: {},
      expectedOutput: "Positioning hypothesis, content themes, channel focus and rationale.",
      verification: { kind: "json_schema", schema: "strategy" },
      requiresApproval: false,
      dependsOn: [key("research")],
      maxAttempts: 3,
    },
    {
      dedupeKey: key("campaign_plan"),
      type: "campaign_plan",
      title: "Create the first campaign",
      agentRole: TASK_ROLE.strategy,
      status: "pending",
      inputs: {},
      expectedOutput: "A persisted campaign with one message, one audience, channels/formats and the goal's success metric.",
      verification: { kind: "json_schema", schema: "campaign_plan" },
      requiresApproval: false,
      dependsOn: [key("strategy")],
      maxAttempts: 3,
    },
  ];
}

/** Downstream specs created by predecessors on success. */

export function contentSpecsForChannels(goalId: string, campaignId: string, channels: { channel: string; format: string }[]): TaskSpec[] {
  const key = (slot: string) => `goal:${goalId}:${slot}`;
  const publishKey = key("publish");
  const specs: TaskSpec[] = [];
  for (const c of channels) {
    specs.push({
      dedupeKey: key(`content:${c.channel}`),
      type: "content_draft",
      title: `Draft ${c.format} content for ${c.channel}`,
      agentRole: TASK_ROLE.content_draft,
      status: "pending",
      inputs: { channel: c.channel, format: c.format, campaignId },
      expectedOutput: `A channel-specific ${c.channel} draft persisted as a content item with its AI revision.`,
      verification: { kind: "json_schema", schema: "content_draft" },
      requiresApproval: false,
      dependsOn: [key("campaign_plan")],
      maxAttempts: 3,
    });
  }
  specs.push({
    dedupeKey: key("approval_gate"),
    type: "approval_gate",
    title: "Human approval of campaign content",
    agentRole: TASK_ROLE.approval_gate,
    status: "pending",
    inputs: { campaignId },
    expectedOutput: "Explicit human approval recorded for every draft before any external action.",
    verification: { kind: "nonempty" },
    requiresApproval: true,
    dependsOn: channels.map((c) => key(`content:${c.channel}`)),
    maxAttempts: 3,
  });
  specs.push({
    dedupeKey: publishKey,
    type: "publish",
    title: "Publish approved content",
    agentRole: TASK_ROLE.publish,
    status: "pending",
    inputs: { campaignId },
    expectedOutput: "Provider-confirmed publications (or honest blocked/failed records) for each approved item.",
    verification: { kind: "json_schema", schema: "publish_result" },
    requiresApproval: false,
    dependsOn: [key("approval_gate")],
    maxAttempts: 3,
  });
  specs.push({
    dedupeKey: key("measure"),
    type: "measure",
    title: "Measure observed outcomes",
    agentRole: TASK_ROLE.measure,
    status: "pending",
    inputs: { campaignId },
    expectedOutput: "Real recorded outcomes (publications, tracked clicks, first-party events, provider metrics) with data limitations stated.",
    verification: { kind: "json_schema", schema: "measurement" },
    requiresApproval: false,
    dependsOn: [publishKey],
    maxAttempts: 3,
  });
  specs.push({
    dedupeKey: key("evaluate"),
    type: "evaluate",
    title: "Evaluate the experiment against recorded data",
    agentRole: TASK_ROLE.evaluate,
    status: "pending",
    inputs: { campaignId },
    expectedOutput: "An evidence-based experiment evaluation using only recorded observations.",
    verification: { kind: "json_schema", schema: "evaluation" },
    requiresApproval: false,
    dependsOn: [key("measure")],
    maxAttempts: 3,
  });
  specs.push({
    dedupeKey: key("recommend"),
    type: "recommend",
    title: "Recommend the next action",
    agentRole: TASK_ROLE.recommend,
    status: "pending",
    inputs: { campaignId },
    expectedOutput: "A recommendation citing recorded evidence, with uncertainty disclosed.",
    verification: { kind: "json_schema", schema: "recommendation" },
    requiresApproval: false,
    dependsOn: [key("evaluate"), key("measure")],
    maxAttempts: 3,
  });
  return specs;
}

/** Default format per channel for the first campaign wave. */
export const DEFAULT_CHANNEL_FORMATS: { channel: string; format: string }[] = [
  { channel: "x", format: "single" },
  { channel: "linkedin", format: "insight" },
  { channel: "shortvideo", format: "hook_script" },
];
