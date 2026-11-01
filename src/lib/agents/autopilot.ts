import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { approvalState } from "@/lib/product/profile-review";
import { createStrategy } from "@/lib/strategy/service";
import { writeDraftsFromStrategy } from "@/lib/content/from-strategy";
import { enqueue, JOB, queueConfigured } from "@/lib/queue/jobs";

/**
 * Autopilot — the agents act on the founder's decisions.
 *
 *   approve the profile  → the strategist drafts the strategy
 *   approve the strategy → the creator writes the drafts
 *
 * The founder only decides; the work starts by itself. Each run is an
 * AgentTask (its own type, no lease, so the goal-cycle orchestrator never
 * picks it up) and shows in the agent team, the activity feed and on the
 * screen where its result will appear. Runs are idempotent: one strategy per
 * profile version, and drafts skip what already exists. Workspaces with
 * agents paused are left alone.
 */

export const AUTOPILOT_TYPES = { strategy: "autopilot_strategy", drafts: "autopilot_drafts" } as const;

async function agentsPaused(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { agentsPausedAt: true } });
  return Boolean(ws?.agentsPausedAt);
}

/**
 * Claim a run by its dedupe key. Returns the task id, or null when the same
 * run is already in progress or done. A failed run is claimed again.
 */
async function claim(workspaceId: string, key: string, data: { type: string; agentRole: string; title: string; inputs: Record<string, unknown> }) {
  const existing = await prisma.agentTask.findUnique({ where: { dedupeKey: key } });
  if (existing) {
    if (existing.status !== "failed") return null;
    const res = await prisma.agentTask.updateMany({ where: { id: existing.id, status: "failed" }, data: { status: "running", startedAt: new Date(), lastError: null, attempts: { increment: 1 } } });
    return res.count === 1 ? existing.id : null;
  }
  try {
    const task = await prisma.agentTask.create({
      data: { workspaceId, dedupeKey: key, ...data, inputs: JSON.stringify(data.inputs), status: "running", startedAt: new Date(), attempts: 1 },
    });
    return task.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null; // another run won
    throw err;
  }
}

async function finish(taskId: string, ok: boolean, summary: string, refs: Record<string, string> = {}) {
  await prisma.agentTask.update({
    where: { id: taskId },
    data: ok
      ? { status: "completed", completedAt: new Date(), output: JSON.stringify({ summary, refs, data: refs }) }
      : { status: "failed", completedAt: new Date(), lastError: summary.slice(0, 500) },
  });
}

/** The strategist drafts a strategy for the current approved profile version. */
export async function runAutopilotStrategy(workspaceId: string): Promise<{ ran: boolean; reason: string }> {
  if (await agentsPaused(workspaceId)) return { ran: false, reason: "agents paused" };
  const profile = await prisma.productProfile.findUnique({ where: { workspaceId } });
  if (!profile || approvalState(profile).needsApproval) return { ran: false, reason: "profile not approved" };
  const existing = await prisma.strategy.findFirst({ where: { workspaceId, profileVersion: profile.version, status: { in: ["proposed", "approved"] } }, select: { id: true } });
  if (existing) return { ran: false, reason: "strategy already exists for this profile version" };

  const taskId = await claim(workspaceId, `autopilot-strategy-${workspaceId}-v${profile.version}`, {
    type: AUTOPILOT_TYPES.strategy,
    agentRole: "strategist",
    title: `Draft the distribution strategy from profile v${profile.version}`,
    inputs: { profileVersion: profile.version },
  });
  if (!taskId) return { ran: false, reason: "already running or done" };
  try {
    const s = await createStrategy({ workspaceId, userId: null });
    await finish(taskId, true, `Strategy v${s.version} drafted (${s.method === "model" ? "model" : "template"}); waiting on your review.`, { strategyId: s.id });
    return { ran: true, reason: "drafted" };
  } catch (err) {
    await finish(taskId, false, err instanceof Error ? err.message : "Strategy drafting failed.");
    return { ran: false, reason: "failed" };
  }
}

/** The creator writes drafts from an approved strategy. */
export async function runAutopilotDrafts(workspaceId: string, strategyId: string): Promise<{ ran: boolean; reason: string }> {
  if (await agentsPaused(workspaceId)) return { ran: false, reason: "agents paused" };
  const strategy = await prisma.strategy.findFirst({ where: { id: strategyId, workspaceId }, select: { status: true, version: true } });
  if (!strategy || strategy.status !== "approved") return { ran: false, reason: "strategy not approved" };

  const taskId = await claim(workspaceId, `autopilot-drafts-${strategyId}`, {
    type: AUTOPILOT_TYPES.drafts,
    agentRole: "creator",
    title: `Write drafts from strategy v${strategy.version}`,
    inputs: { strategyId },
  });
  if (!taskId) return { ran: false, reason: "already running or done" };
  try {
    const r = await writeDraftsFromStrategy(workspaceId, { strategyId });
    await finish(taskId, true, `${r.created.length} draft${r.created.length === 1 ? "" : "s"} written from strategy v${strategy.version}; waiting on your review.`, { strategyId, campaignId: r.campaignId });
    return { ran: true, reason: "written" };
  } catch (err) {
    await finish(taskId, false, err instanceof Error ? err.message : "Draft writing failed.");
    return { ran: false, reason: "failed" };
  }
}

/**
 * Start a run without making the founder wait: on the queue when there is
 * one, otherwise in this process after the response. Never throws.
 */
export async function triggerAutopilot(run: { kind: "strategy"; workspaceId: string } | { kind: "drafts"; workspaceId: string; strategyId: string }): Promise<void> {
  try {
    if (queueConfigured()) {
      if (run.kind === "strategy") await enqueue(JOB.autopilotStrategy, { workspaceId: run.workspaceId }, { attempts: 1, removeOnComplete: { count: 1000 } });
      else await enqueue(JOB.autopilotDrafts, { workspaceId: run.workspaceId, strategyId: run.strategyId }, { attempts: 1, removeOnComplete: { count: 1000 } });
      return;
    }
  } catch {
    /* queue down: run in process below */
  }
  const job = run.kind === "strategy" ? runAutopilotStrategy(run.workspaceId) : runAutopilotDrafts(run.workspaceId, run.strategyId);
  void job.catch(() => {});
}
