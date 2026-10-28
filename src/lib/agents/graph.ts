import { TASK_TERMINAL_STATUSES } from "@/lib/state-machines";

/**
 * Pure orchestration graph logic — no database, no network, no clock access
 * (now is always passed in). The orchestrator applies these decisions to the
 * database; unit tests exercise them directly.
 */

export type GraphTask = {
  id: string;
  status: string;
  dependsOn: string[];
  attempts: number;
  maxAttempts: number;
  leasedUntil: Date | null;
  type: string;
};

// --- Dependency resolution ---

/**
 * Observer tasks measure and interpret RECORDED reality, so they must run
 * even when an upstream stage ended blocked or failed — that is exactly when
 * an honest "nothing was published, nothing was measured" result matters.
 * They are promoted once their dependencies reach any terminal state.
 */
const OBSERVER_TYPES = new Set(["measure", "evaluate", "recommend"]);

function depState(t: Pick<GraphTask, "dependsOn" | "type">, byId: Map<string, GraphTask>): "complete" | "terminal" | "waiting" {
  const deps = t.dependsOn.map((id) => byId.get(id)).filter(Boolean) as GraphTask[];
  if (deps.length === 0) return "complete";
  if (deps.every((d) => d.status === "completed")) return "complete";
  // NOTE: every() passes the dependency OBJECT, not its status string.
  const isTerminal = (d: GraphTask) =>
    d.status === "completed" || d.status === "blocked" || d.status === "failed" || d.status === "cancelled";
  if (OBSERVER_TYPES.has(t.type) && deps.every(isTerminal)) return "terminal";
  return "waiting";
}

/**
 * Pending tasks whose dependencies are all completed become ready (observer
 * tasks also proceed when dependencies ended blocked/failed/cancelled — they
 * observe reality instead of depending on success).
 */
export function pendingToReady(tasks: GraphTask[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: string[] = [];
  for (const t of tasks) {
    if (t.status !== "pending") continue;
    const state = depState(t, byId);
    if (state === "complete" || state === "terminal") out.push(t.id);
  }
  return out;
}

/**
 * Failure propagation: pending/ready tasks with a terminally failed or
 * cancelled dependency become blocked — they can never run successfully.
 * Observer tasks (measure/evaluate/recommend) are exempt: their job is to
 * report recorded reality, including after a blocked publish.
 */
export function blockDependentsOfFailure(tasks: GraphTask[]): { taskId: string; failedDep: string }[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: { taskId: string; failedDep: string }[] = [];
  for (const t of tasks) {
    if (t.status !== "pending" && t.status !== "ready") continue;
    if (OBSERVER_TYPES.has(t.type)) continue;
    for (const depId of t.dependsOn) {
      const dep = byId.get(depId);
      if (dep && (dep.status === "failed" || dep.status === "cancelled")) {
        out.push({ taskId: t.id, failedDep: depId });
        break;
      }
    }
  }
  return out;
}

// --- Failure recovery ---

/**
 * Which failed tasks may be retried (bounded by maxAttempts)?
 */
export function retryableFailed(tasks: GraphTask[]): string[] {
  return tasks.filter((t) => t.status === "failed" && t.attempts < t.maxAttempts).map((t) => t.id);
}

/**
 * Crash recovery: running tasks whose lease expired are requeued (status
 * ready). Their side effects must be idempotent — the handlers adopt existing
 * work via dedupe keys and stored outputs.
 */
export function expiredLeases(tasks: GraphTask[], now: Date): string[] {
  return tasks
    .filter((t) => t.status === "running" && t.leasedUntil !== null && t.leasedUntil.getTime() < now.getTime())
    .map((t) => t.id);
}

// --- Concurrency planning ---

/** Is there a dependency path from a to b (transitively)? */
function reaches(from: GraphTask, toId: string, byId: Map<string, GraphTask>, seen = new Set<string>()): boolean {
  if (seen.has(from.id)) return false;
  seen.add(from.id);
  for (const depId of from.dependsOn) {
    if (depId === toId) return true;
    const dep = byId.get(depId);
    if (dep && reaches(dep, toId, byId, seen)) return true;
  }
  return false;
}

/**
 * Pick the largest prefix set of ready tasks that are mutually independent
 * (no dependency path between any pair) — safe to execute in parallel.
 * Deterministic order: input order. Generic: returns the enriched task type.
 */
export function parallelBatch<T extends GraphTask>(readyTasks: T[], maxConcurrency: number): T[] {
  const byId = new Map(readyTasks.map((t) => [t.id, t]));
  const batch: T[] = [];
  for (const candidate of readyTasks) {
    if (batch.length >= maxConcurrency) break;
    const conflicts = batch.some(
      (b) => reaches(candidate, b.id, byId) || reaches(b, candidate.id, byId)
    );
    if (!conflicts) batch.push(candidate);
  }
  return batch;
}

// --- Progress ---

/**
 * Goal progress as a percentage of non-cancelled tasks completed. A goal
 * with no tasks has progress 0 (a true zero, not an error).
 */
export function progressPercent(tasks: Pick<GraphTask, "status">[]): number {
  const relevant = tasks.filter((t) => t.status !== "cancelled");
  if (relevant.length === 0) return 0;
  const completed = relevant.filter((t) => t.status === "completed").length;
  return Math.round((completed / relevant.length) * 100);
}

/** True when every non-cancelled task is complete — the workflow has finished. */
export function workflowComplete(tasks: Pick<GraphTask, "status">[]): boolean {
  const relevant = tasks.filter((t) => t.status !== "cancelled");
  return relevant.length > 0 && relevant.every((t) => t.status === "completed");
}

/** Summaries used by the UI and activity feed. */
export function workflowBlockers(tasks: { id: string; status: string; lastError?: string | null; type: string }[]): { id: string; type: string; reason: string }[] {
  return tasks
    .filter((t) => t.status === "blocked" || (t.status === "failed" && t.lastError))
    .map((t) => ({ id: t.id, type: t.type, reason: t.lastError ?? "blocked" }));
}

/** Guard used before executing: terminal tasks must never run again. */
export function isTerminalStatus(status: string): boolean {
  return (TASK_TERMINAL_STATUSES as readonly string[]).includes(status);
}
