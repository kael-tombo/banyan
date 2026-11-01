import { prisma } from "@/lib/db";
import { canTransitionTask, type TaskType } from "@/lib/state-machines";
import { recordActivity, type ActivityType } from "@/lib/activity";
import { randomSlug } from "@/lib/crypto";
import {
  blockDependentsOfFailure,
  expiredLeases,
  pendingToReady,
  parallelBatch,
  progressPercent,
  retryableFailed,
  workflowComplete,
  workflowBlockers,
  type GraphTask,
} from "@/lib/agents/graph";
import { parseTaskEnvelope, type HandlerContext, type HandlerResult, type TaskEnvelope, type TaskOutput } from "@/lib/agents/types";
import { verifyOutput } from "@/lib/agents/verify";
import { HANDLERS } from "@/lib/agents/handlers";
import { initialDistributionTasks } from "@/lib/agents/workflow-template";

/**
 * The agent orchestrator — one central runtime for all workflows.
 *
 * Guarantees:
 *  - Persisted workflow state: every decision is an AgentTask/TaskRun row.
 *  - Safe resumption: running tasks hold a lease; expired leases are requeued
 *    and handlers adopt their previous work instead of duplicating it.
 *  - No duplicate side effects: atomic claims (updateMany on a status
 *    transition), unique dedupe keys on task creation, and the publishing
 *    flow's own active-publication + idempotency guards.
 *  - Parallel execution only for independent tasks (graph-based batch).
 *  - Verification before completion: handler outputs must pass the task's
 *    declared criteria, or the task does not complete.
 *  - Human approval: tasks with requiresApproval wait in waiting_approval;
 *    consequential external actions are refused without recorded approval.
 */

const CONCURRENCY = 3;
const LEASE_MS = 5 * 60_000;

export type AdvanceReport = {
  requeuedLeases: number;
  promoted: number;
  retried: number;
  blockedByDeps: number;
  executed: number;
  completed: number;
  failed: number;
  waitingApproval: number;
  blocked: number;
  /** True when the workspace's agents are paused by a human — nothing was touched. */
  paused?: boolean;
};

export async function advanceWorkspace(workspaceId: string, opts?: { userId?: string | null; maxTasks?: number }): Promise<AdvanceReport> {
  const report: AdvanceReport = { requeuedLeases: 0, promoted: 0, retried: 0, blockedByDeps: 0, executed: 0, completed: 0, failed: 0, waitingApproval: 0, blocked: 0 };
  const now = new Date();
  const maxTasks = opts?.maxTasks ?? 6;

  // Human pause is enforced here — the single funnel every caller (UI advance,
  // worker tick) goes through. Paused means nothing changes at all: no leases
  // recovered, no retries, no executions. Resume by clearing the pause.
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { agentsPausedAt: true } });
  if (ws?.agentsPausedAt) {
    report.paused = true;
    return report;
  }

  const rows = await prisma.agentTask.findMany({ where: { workspaceId } });
  const tasks = rows.map(parseTaskEnvelope);

  // Goals whose workflows are paused/cancelled: reconcile but never execute.
  const goalIds = Array.from(new Set(tasks.map((t) => t.goalId).filter((v): v is string => !!v)));
  const goals = await prisma.goal.findMany({ where: { id: { in: goalIds } }, select: { id: true, status: true } });
  const haltedGoals = new Set(goals.filter((g) => ["paused", "cancelled", "missed", "achieved"].includes(g.status)).map((g) => g.id));
  const executable = (t: TaskEnvelope) => !t.goalId || !haltedGoals.has(t.goalId);

  // 1. Crash recovery: requeue expired leases.
  for (const t of tasks) {
    if (t.status !== "running" || !executable(t)) continue;
    if (t.leasedUntil && t.leasedUntil.getTime() < now.getTime()) {
      const claimed = await prisma.agentTask.updateMany({
        where: { id: t.id, status: "running" },
        data: { status: "ready", leasedUntil: null },
      });
      if (claimed.count === 1) {
        t.status = "ready";
        t.leasedUntil = null;
        report.requeuedLeases++;
        await prisma.taskRun.create({
          data: { taskId: t.id, attempt: t.attempts, status: "requeued", error: "Lease expired (worker restarted or crashed); task requeued for resumption.", finishedAt: new Date() },
        });
      }
    }
  }

  // 2. Promote pending → ready, injecting dependency outputs into inputs.
  const promotable = pendingToReady(tasks as GraphTask[]);
  for (const t of tasks) {
    if (!promotable.includes(t.id) || !executable(t)) continue;
    const claimed = await prisma.agentTask.updateMany({
      where: { id: t.id, status: "pending" },
      data: { status: "ready" },
    });
    if (claimed.count === 1) {
      t.status = "ready";
      report.promoted++;
      await injectDependencyOutputs(t, tasks);
    }
  }

  // 3. Failure propagation: dependents of failed/cancelled tasks are blocked.
  for (const { taskId, failedDep } of blockDependentsOfFailure(tasks as GraphTask[])) {
    const t = tasks.find((x) => x.id === taskId);
    if (!t || !executable(t)) continue;
    const claimed = await prisma.agentTask.updateMany({
      where: { id: t.id, status: { in: ["pending", "ready"] } },
      data: { status: "blocked", lastError: `Dependency ${failedDep} failed or was cancelled.` },
    });
    if (claimed.count === 1) {
      t.status = "blocked";
      report.blockedByDeps++;
    }
  }

  // 4. Bounded automatic retry of TRANSIENT failures only (marked "transient:"
  //    by handlers). Permanent failures wait for an explicit user retry.
  for (const id of retryableFailed(tasks as GraphTask[])) {
    const t = tasks.find((x) => x.id === id);
    if (!t || !executable(t) || !t.lastError?.startsWith("transient:")) continue;
    const claimed = await prisma.agentTask.updateMany({
      where: { id: t.id, status: "failed", attempts: { lt: t.maxAttempts } },
      data: { status: "ready", lastError: t.lastError },
    });
    if (claimed.count === 1) {
      t.status = "ready";
      report.retried++;
    }
  }

  // 5. Execute the largest safe batch of ready tasks in parallel.
  const readyNow = tasks.filter((t) => t.status === "ready" && executable(t));
  const batch = parallelBatch(readyNow, Math.min(CONCURRENCY, maxTasks));
  const results = await Promise.all(batch.map((t) => executeTask(t, opts?.userId ?? null)));
  for (const r of results) {
    if (r === null) continue; // claimed by a concurrent runner; honestly not counted
    report.executed++;
    if (r === "completed") report.completed++;
    else if (r === "failed") report.failed++;
    else if (r === "waiting_approval") report.waitingApproval++;
    else if (r === "blocked") report.blocked++;
  }

  // 6. Reconcile blocked publish tasks whose publications finished meanwhile.
  await reconcileBlockedPublishTasks(workspaceId, report);

  // 7. Refresh cached goal progress + workflow completion.
  await refreshGoalProgress(workspaceId);

  return report;
}

/** Merge upstream task outputs into a ready task's inputs (per dep type). */
async function injectDependencyOutputs(task: TaskEnvelope, all: TaskEnvelope[]): Promise<void> {
  const depIds = task.dependsOn;
  if (depIds.length === 0) return;
  const deps = all.filter((t) => depIds.includes(t.id));
  const outputs = deps.filter((d) => d.output).map((d) => ({ type: d.type as string, output: d.output as TaskOutput }));
  if (outputs.length === 0) return;
  const currentInputs = { ...task.inputs };
  const merged = { ...(currentInputs.deps as Record<string, TaskOutput> | undefined) };
  for (const { type, output } of outputs) {
    merged[type] = output;
  }
  currentInputs.deps = merged;
  await prisma.agentTask.update({ where: { id: task.id }, data: { inputs: JSON.stringify(currentInputs) } });
  task.inputs = currentInputs;
}

type ExecutionResult = "completed" | "failed" | "waiting_approval" | "blocked";

async function executeTask(task: TaskEnvelope, userId: string | null): Promise<ExecutionResult | null> {
  const handler = HANDLERS[task.type as TaskType];
  if (!handler) {
    await finalizeFailure(task, `No handler registered for task type "${task.type}".`, false);
    return "failed";
  }

  // Atomic claim: only one runner may move this task ready → running.
  const leaseUntil = new Date(Date.now() + LEASE_MS);
  const claimed = await prisma.agentTask.updateMany({
    where: { id: task.id, status: "ready" },
    data: { status: "running", leasedUntil: leaseUntil, startedAt: task.startedAt ?? new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return null; // another runner took it; do not count as our work
  task.attempts += 1;

  const run = await prisma.taskRun.create({
    data: { taskId: task.id, attempt: task.attempts, status: "running", log: "[]" },
  });

  const logEntries: { at: string; step: string; detail?: string }[] = [];
  const ctx: HandlerContext = {
    task,
    workspaceId: task.workspaceId,
    goalId: task.goalId,
    userId,
    log: (step, detail) => logEntries.push({ at: new Date().toISOString(), step, detail: detail ? detail.slice(0, 300) : undefined }),
  };

  let result: HandlerResult;
  try {
    result = await handler(ctx);
  } catch (err) {
    result = { outcome: "failed", error: `Handler threw: ${(err as Error).message}`, retryable: true };
  }

  await persistRunLog(run.id, logEntries);

  switch (result.outcome) {
    case "completed": {
      const verdict = verifyOutput(task.verification, result.output);
      if (!verdict.ok) {
        await finalizeFailure(task, `Verification failed: ${verdict.error}`, true, run.id);
        return "failed";
      }
      await prisma.agentTask.update({
        where: { id: task.id },
        data: { status: "completed", output: JSON.stringify(result.output), lastError: null, leasedUntil: null, completedAt: new Date() },
      });
      await prisma.taskRun.update({ where: { id: run.id }, data: { status: "completed", output: JSON.stringify(result.output), finishedAt: new Date() } });
      await recordActivity({
        workspaceId: task.workspaceId,
        type: "task" as ActivityType,
        actorType: "ai",
        summary: `Task completed: ${task.title}`,
        meta: { taskId: task.id, goalId: task.goalId },
      });
      return "completed";
    }
    case "waiting_approval": {
      await prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: "waiting_approval",
          leasedUntil: null,
          lastError: result.note.slice(0, 400),
          ...(result.output ? { output: JSON.stringify(result.output) } : {}),
        },
      });
      await prisma.taskRun.update({ where: { id: run.id }, data: { status: "completed", error: result.note.slice(0, 400), finishedAt: new Date() } });
      return "waiting_approval";
    }
    case "blocked": {
      await prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: "blocked",
          lastError: `${result.reason} → ${result.actionable}`.slice(0, 800),
          leasedUntil: null,
          // Persist progress so a retry reconciles instead of re-doing side effects.
          ...(result.output ? { output: JSON.stringify(result.output) } : {}),
        },
      });
      await prisma.taskRun.update({ where: { id: run.id }, data: { status: "failed", error: `${result.reason} ${result.actionable}`.slice(0, 800), finishedAt: new Date() } });
      await recordActivity({
        workspaceId: task.workspaceId,
        type: "task" as ActivityType,
        actorType: "system",
        summary: `Task blocked: ${task.title} — ${result.reason}`,
        meta: { taskId: task.id, goalId: task.goalId, actionable: result.actionable },
      });
      return "blocked";
    }
    case "failed": {
      const prefix = result.retryable ? "transient: " : "permanent: ";
      await finalizeFailure(task, `${prefix}${result.error}`, result.retryable, run.id, result.output);
      return "failed";
    }
  }
}

async function finalizeFailure(task: TaskEnvelope, error: string, retryable: boolean, runId?: string, output?: TaskOutput): Promise<void> {
  const terminal = !retryable || task.attempts >= task.maxAttempts;
  await prisma.agentTask.update({
    where: { id: task.id },
    data: {
      // Transient failures within budget requeue immediately; the next tick
      // retries them (bounded by attempts vs maxAttempts).
      status: terminal ? "failed" : "ready",
      lastError: error.slice(0, 800),
      leasedUntil: null,
      ...(output ? { output: JSON.stringify(output) } : {}),
    },
  });
  if (runId) {
    await prisma.taskRun.update({ where: { id: runId }, data: { status: "failed", error: error.slice(0, 800), finishedAt: new Date() } });
  }
  await recordActivity({
    workspaceId: task.workspaceId,
    type: "task" as ActivityType,
    actorType: "system",
    summary: `Task ${terminal ? "failed" : "will retry"}: ${task.title} — ${error.slice(0, 200)}`,
    meta: { taskId: task.id, goalId: task.goalId },
  });
}

async function persistRunLog(runId: string, entries: { at: string; step: string; detail?: string }[]): Promise<void> {
  try {
    await prisma.taskRun.update({ where: { id: runId }, data: { log: JSON.stringify(entries.slice(-50)) } });
  } catch {
    /* the run row may have been cleaned up concurrently; logging is best-effort */
  }
}

/**
 * Publish tasks can be blocked while the publishing worker still completes a
 * scheduled retry. Reconcile those with reality: complete or fail the task
 * according to the publication's recorded outcome.
 */
async function reconcileBlockedPublishTasks(workspaceId: string, report: AdvanceReport): Promise<void> {
  const blockedPublish = await prisma.agentTask.findMany({
    where: { workspaceId, status: "blocked", type: "publish" },
    take: 10,
  });
  for (const t of blockedPublish) {
    const env = parseTaskEnvelope(t);
    const publicationId = env.output?.refs?.publicationId ?? env.output?.data?.publicationId;
    if (typeof publicationId !== "string" || !publicationId) continue;
    const pub = await prisma.publication.findUnique({ where: { id: publicationId }, include: { contentItem: true } });
    if (!pub || pub.contentItem.workspaceId !== workspaceId) continue;
    if (pub.status === "published") {
      await prisma.agentTask.update({
        where: { id: t.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          lastError: null,
          output: JSON.stringify({
            summary: `Publication confirmed after a scheduled retry (${pub.contentItem.title}).`,
            refs: { publicationId: pub.id, publicationStatus: "published" },
            data: { publicationStatus: "published", externalUrl: pub.externalUrl ?? undefined },
          }),
        },
      });
      report.completed++;
    } else if (pub.status === "failed") {
      await prisma.agentTask.update({ where: { id: t.id }, data: { status: "failed", lastError: `transient: Publication failed after provider retries: ${pub.lastError ?? "unknown"}` } });
      report.failed++;
    }
  }
}

export async function refreshGoalProgress(workspaceId: string): Promise<void> {
  const goals = await prisma.goal.findMany({ where: { workspaceId, status: { in: ["planning", "awaiting_approval", "active"] } }, select: { id: true } });
  for (const g of goals) {
    const tasks = await prisma.agentTask.findMany({ where: { goalId: g.id }, select: { status: true } });
    // A strategy-backed cycle has no tasks; its progress comes from its campaign (lifecycle-service).
    if (tasks.length === 0) continue;
    const progress = progressPercent(tasks);
    await prisma.goal.update({ where: { id: g.id }, data: { progress } }).catch(() => {});
    if (workflowComplete(tasks)) {
      await recordActivity({
        workspaceId,
        type: "goal" as ActivityType,
        actorType: "system",
        summary: "Workflow complete: every task in this goal's plan has finished. Review the recommendation and mark the goal achieved or set the next one.",
        meta: { goalId: g.id },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Workflow lifecycle operations (used by API routes)
// ---------------------------------------------------------------------------

/** Create the initial workflow for a goal (idempotent via dedupe keys). */
export async function startGoalWorkflow(goalId: string, workspaceId: string): Promise<void> {
  const specs = initialDistributionTasks(goalId);
  await createInitialTasks(specs, { workspaceId, goalId });
}

async function createInitialTasks(
  specs: ReturnType<typeof initialDistributionTasks>,
  ctx: { workspaceId: string; goalId: string }
): Promise<void> {
  for (const spec of specs) {
    try {
      await prisma.agentTask.create({
        data: {
          workspaceId: ctx.workspaceId,
          goalId: ctx.goalId,
          dedupeKey: spec.dedupeKey,
          type: spec.type,
          title: spec.title,
          agentRole: spec.agentRole,
          status: spec.status,
          inputs: JSON.stringify(spec.inputs ?? {}),
          expectedOutput: spec.expectedOutput,
          verification: JSON.stringify(spec.verification),
          requiresApproval: spec.requiresApproval,
          dependsOn: "[]",
          maxAttempts: spec.maxAttempts,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  // Resolve dependencies (dedupe keys → task ids).
  const all = await prisma.agentTask.findMany({
    where: { workspaceId: ctx.workspaceId, goalId: ctx.goalId },
    select: { id: true, dedupeKey: true, dependsOn: true },
  });
  const byKey = new Map(all.map((t) => [t.dedupeKey, t.id]));
  for (const spec of specs) {
    const selfId = byKey.get(spec.dedupeKey);
    if (!selfId || spec.dependsOn.length === 0) continue;
    const depIds = spec.dependsOn.map((k) => byKey.get(k)).filter((v): v is string => !!v);
    const row = all.find((t) => t.id === selfId);
    const current = row ? (JSON.parse(row.dependsOn) as string[]) : [];
    const merged = Array.from(new Set([...current, ...depIds]));
    if (merged.length !== current.length) {
      await prisma.agentTask.update({ where: { id: selfId }, data: { dependsOn: JSON.stringify(merged) } });
    }
  }
}

/** Complete a waiting_approval plan task after a human decision (approve). */
export async function completePlanTask(planTaskId: string, output: TaskOutput): Promise<void> {
  const task = await prisma.agentTask.findUnique({ where: { id: planTaskId } });
  if (!task || task.status !== "waiting_approval") return;
  if (!canTransitionTask(task.status, "completed")) return;
  await prisma.agentTask.update({
    where: { id: planTaskId },
    data: { status: "completed", output: JSON.stringify(output), completedAt: new Date(), lastError: null },
  });
  await prisma.taskRun.updateMany({ where: { taskId: planTaskId, status: "running" }, data: { status: "completed", finishedAt: new Date() } });
}

/** Block a waiting_approval plan task after a rejection. */
export async function blockPlanTask(planTaskId: string, reason: string): Promise<void> {
  const task = await prisma.agentTask.findUnique({ where: { id: planTaskId } });
  if (!task || task.status !== "waiting_approval") return;
  await prisma.agentTask.update({
    where: { id: planTaskId },
    data: { status: "blocked", lastError: `Plan rejected by the user: ${reason}`.slice(0, 400) },
  });
}

/** Generate a fresh idempotency-safe run id (used for tracing manual triggers). */
export function newRunTrace(): string {
  return `run_${randomSlug()}`;
}

/** Summaries for UI: blockers across a workspace's goals. */
export async function workspaceBlockers(workspaceId: string) {
  const tasks = await prisma.agentTask.findMany({
    where: { workspaceId, status: { in: ["blocked", "failed"] } },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true, title: true, status: true, lastError: true, goalId: true, type: true },
  });
  return workflowBlockers(tasks.map((t) => ({ ...t, type: t.type as string })));
}
