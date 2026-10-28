/**
 * Explicit workflow state machines. All transitions are enforced server-side.
 */

export const CAMPAIGN_STATUSES = ["draft", "planned", "in_progress", "completed", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["planned", "archived"],
  planned: ["in_progress", "archived"],
  in_progress: ["completed", "archived"],
  completed: ["in_progress", "archived"],
  archived: ["draft"],
};

export function canTransitionCampaign(from: string, to: string): boolean {
  if (from === to) return true; // no-op saves are allowed
  const allowed = CAMPAIGN_TRANSITIONS[from as CampaignStatus];
  return !!allowed && (allowed as readonly string[]).includes(to);
}

export const CONTENT_STATUSES = [
  "draft",
  "ready_for_review",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "rejected",
  "archived",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  draft: ["ready_for_review", "archived"],
  ready_for_review: ["approved", "rejected", "draft", "archived"],
  approved: ["scheduled", "draft", "archived"],
  scheduled: ["publishing", "approved", "failed", "archived"],
  publishing: ["published", "failed", "scheduled"], // scheduled: transient failure rolled back for bounded worker retry
  failed: ["draft", "scheduled", "publishing", "archived"],
  published: ["archived"],
  rejected: ["draft", "archived"],
  archived: [],
};

export function canTransitionContent(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = CONTENT_TRANSITIONS[from as ContentStatus];
  return !!allowed && (allowed as readonly string[]).includes(to);
}

/**
 * Export guard: which content statuses may be handed to a publishing adapter.
 * Only content with explicit recorded human approval (approvedById set)
 * qualifies. "publishing" is included because the publisher itself moves an
 * approved item through that transient state — a revoked approval (approvedById
 * cleared, or the item returned to draft/rejected) still refuses export.
 * This is enforced in the publishing workflow, not the UI.
 */
export function isExportableContent(item: { status: string; approvedById: string | null }): boolean {
  const ok = item.status === "approved" || item.status === "scheduled" || item.status === "publishing";
  return ok && !!item.approvedById;
}

// ---------------------------------------------------------------------------
// Agentic execution runtime state machines
// ---------------------------------------------------------------------------

export const GOAL_STATUSES = [
  "draft",
  "planning",
  "awaiting_approval",
  "active",
  "paused",
  "achieved",
  "missed",
  "cancelled",
] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_TRANSITIONS: Record<GoalStatus, GoalStatus[]> = {
  draft: ["planning", "cancelled"],
  planning: ["awaiting_approval", "cancelled"],
  awaiting_approval: ["active", "planning", "cancelled"], // planning: regenerate the plan
  active: ["paused", "achieved", "missed", "cancelled"],
  paused: ["active", "cancelled"],
  achieved: [],
  missed: [],
  cancelled: [],
};

export function canTransitionGoal(from: string, to: string): boolean {
  if (from === to) return true; // no-op saves are allowed
  const allowed = GOAL_TRANSITIONS[from as GoalStatus];
  return !!allowed && (allowed as readonly string[]).includes(to);
}

export const TASK_STATUSES = [
  "pending",
  "ready",
  "running",
  "waiting_approval",
  "blocked",
  "completed",
  "failed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["ready", "cancelled"],
  ready: ["running", "blocked", "cancelled"],
  running: ["completed", "failed", "waiting_approval", "blocked", "ready", "cancelled"], // ready: lease expired, requeued
  waiting_approval: ["completed", "blocked", "cancelled"],
  blocked: ["ready", "failed", "cancelled"], // ready: user fixed the blocker and retries
  completed: [],
  failed: ["ready", "cancelled"], // ready: bounded retry (attempts < maxAttempts)
  cancelled: [],
};

export function canTransitionTask(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = TASK_TRANSITIONS[from as TaskStatus];
  return !!allowed && (allowed as readonly string[]).includes(to);
}

/** Terminal task states: no further execution is possible without a new workflow. */
export const TASK_TERMINAL_STATUSES: readonly string[] = ["completed", "failed", "cancelled"];

// Task types and their assigned agent roles. Kept beside the state machine so
// the orchestrator, the handlers and the UI share one vocabulary.
export const TASK_TYPES = [
  "plan_draft",
  "research",
  "strategy",
  "campaign_plan",
  "content_draft",
  "approval_gate",
  "publish",
  "measure",
  "evaluate",
  "recommend",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const AGENT_ROLES = [
  "planner",
  "researcher",
  "strategist",
  "creator",
  "publisher",
  "analyst",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const TASK_ROLE: Record<TaskType, AgentRole> = {
  plan_draft: "planner",
  research: "researcher",
  strategy: "strategist",
  campaign_plan: "strategist",
  content_draft: "creator",
  approval_gate: "publisher",
  publish: "publisher",
  measure: "analyst",
  evaluate: "analyst",
  recommend: "analyst",
};

export function isTaskType(v: string): v is TaskType {
  return (TASK_TYPES as readonly string[]).includes(v);
}
