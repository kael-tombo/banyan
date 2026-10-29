/**
 * Agent Activity — pure computation behind the /app/activity page.
 *
 * The agent audit trail already exists (AgentTask + TaskRun + ActivityEvent);
 * this module shapes it into the three views the control center needs:
 * filterable activity rows, the human approval queue, and per-agent status.
 * Per-agent status derivation itself lives in growth-loop.ts (computeAgentTeam)
 * and is reused, not duplicated.
 */

import { AGENT_META, type AgentRole } from "@/lib/growth-loop";

// ---------------------------------------------------------------------------
// Activity rows — the audit table
// ---------------------------------------------------------------------------

export type AgentTaskLite = {
  id: string;
  agentRole: string;
  status: string;
  title: string;
  expectedOutput: unknown; // JSON envelope; summarized, never guessed
  goalId: string | null;
  campaignId: string | null;
  requiresApproval: boolean;
  updatedAt: Date;
  attempts: number;
};

export type ActivityRow = {
  id: string;
  at: Date;
  agentRole: string;
  agentName: string;
  action: string;
  detail: string | null;
  status: string;
  goalId: string | null;
  campaignId: string | null;
  requiresApproval: boolean;
  attempts: number;
};

function summarizeExpectedOutput(expected: unknown): string | null {
  if (expected === null || expected === undefined) return null;
  if (typeof expected === "string") return expected.slice(0, 160) || null;
  if (typeof expected === "number" || typeof expected === "boolean") return String(expected);
  if (Array.isArray(expected)) {
    const parts = expected.slice(0, 3).map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
    const joined = parts.join(", ");
    return joined ? `${joined}${expected.length > 3 ? `, +${expected.length - 3} more` : ""}`.slice(0, 160) : null;
  }
  if (typeof expected === "object") {
    const keys = Object.keys(expected as Record<string, unknown>);
    const entries = Object.entries(expected as Record<string, unknown>).slice(0, 3);
    const joined = entries.map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("; ");
    if (!joined) return null;
    return `${joined}${keys.length > 3 ? `, +${keys.length - 3} more` : ""}`.slice(0, 160);
  }
  return null;
}

export function activityRows(tasks: AgentTaskLite[]): ActivityRow[] {
  return tasks
    .map((t) => ({
      id: t.id,
      at: t.updatedAt,
      agentRole: t.agentRole,
      agentName: (AGENT_META as Record<string, { name: string } | undefined>)[t.agentRole]?.name ?? t.agentRole,
      action: t.title,
      detail: summarizeExpectedOutput(t.expectedOutput),
      status: t.status,
      goalId: t.goalId,
      campaignId: t.campaignId,
      requiresApproval: t.requiresApproval,
      attempts: t.attempts,
    }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

export const ACTIVITY_STATUSES = [
  "pending",
  "ready",
  "running",
  "waiting_approval",
  "blocked",
  "failed",
  "completed",
  "cancelled",
] as const;

export function filterActivityRows(
  rows: ActivityRow[],
  filter: { role?: string | null; status?: string | null; since?: Date | null }
): ActivityRow[] {
  return rows.filter((r) => {
    if (filter.role && r.agentRole !== filter.role) return false;
    if (filter.status && r.status !== filter.status) return false;
    if (filter.since && r.at.getTime() < filter.since.getTime()) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Approval queue — human gates recorded in the task/plan trail
// ---------------------------------------------------------------------------

export type ApprovalItem = {
  kind: "task_gate" | "goal_plan";
  /** task id for gates; goal id for plans (the approve endpoint is goal-scoped). */
  id: string;
  title: string;
  agentRole: AgentRole;
  agentName: string;
  at: Date;
  goalId: string | null;
  detail: string | null;
};

export type GoalPlanLite = {
  goalId: string;
  goalObjective: string;
  goalStatus: string;
  summary: string | null;
  status: string; // planned | approved | rejected | superseded
  updatedAt: Date;
};

export function approvalQueueItems(
  tasks: AgentTaskLite[],
  plans: GoalPlanLite[]
): ApprovalItem[] {
  const items: ApprovalItem[] = [];

  for (const t of tasks) {
    if (!t.requiresApproval || t.status !== "waiting_approval") continue;
    if (!(AGENT_META as Record<string, unknown>)[t.agentRole]) continue;
    items.push({
      kind: "task_gate",
      id: t.id,
      title: t.title,
      agentRole: t.agentRole as AgentRole,
      agentName: (AGENT_META as Record<string, { name: string } | undefined>)[t.agentRole]?.name ?? t.agentRole,
      at: t.updatedAt,
      goalId: t.goalId,
      detail: summarizeExpectedOutput(t.expectedOutput),
    });
  }

  for (const p of plans) {
    if (p.status !== "planned" || p.goalStatus !== "awaiting_approval") continue;
    items.push({
      kind: "goal_plan",
      id: p.goalId,
      title: `Plan approval: ${p.goalObjective}`,
      agentRole: "planner",
      agentName: AGENT_META.planner.name,
      at: p.updatedAt,
      goalId: p.goalId,
      detail: p.summary,
    });
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

// ---------------------------------------------------------------------------
// Controls — pause state formatting (enforcement lives in the orchestrator)
// ---------------------------------------------------------------------------

export function pauseSummary(pausedAt: Date | null, now: Date = new Date()): { paused: boolean; label: string } {
  if (!pausedAt) return { paused: false, label: "Agents active" };
  const ms = now.getTime() - pausedAt.getTime();
  const mins = Math.floor(ms / 60_000);
  const label =
    mins < 1 ? "Agents paused just now" : mins < 60 ? `Agents paused ${mins} min ago` : `Agents paused ${Math.floor(mins / 60)} h ago`;
  return { paused: true, label };
}
