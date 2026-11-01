import type { Campaign } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import {
  decide, deriveWorkState, generationBlocked, isLifecycle, legacyStatus, shouldDerive,
  LIFECYCLE_LABEL, type Lifecycle, type LifecycleAction,
} from "./lifecycle";
import { ensureCycleForStrategy, strategyCycleProgress } from "@/lib/cycle/strategy-cycle";

/**
 * Campaign lifecycle persistence — US-046. Rules live in lifecycle.ts.
 * Every change is a conditional update on the state it started from, so two
 * concurrent moves cannot both apply, and every change writes an activity
 * event.
 */

export class LifecycleError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const current = (c: Pick<Campaign, "lifecycle">): Lifecycle => (isLifecycle(c.lifecycle) ? c.lifecycle : "draft");

async function move(c: Campaign, to: Lifecycle, extra: { pausedFrom?: string | null }, summary: string, actorType: "user" | "system") {
  const from = current(c);
  const res = await prisma.campaign.updateMany({
    where: { id: c.id, lifecycle: c.lifecycle },
    data: {
      lifecycle: to,
      status: legacyStatus(to),
      ...("pausedFrom" in extra ? { pausedFrom: extra.pausedFrom ?? null } : {}),
      ...(to === "completed" ? { completedAt: new Date() } : {}),
      ...(["publishing", "published", "scheduled"].includes(to) && !c.startedAt ? { startedAt: new Date() } : {}),
    },
  });
  if (res.count === 0) return false;
  await recordActivity({
    workspaceId: c.workspaceId,
    type: "campaign",
    actorType,
    summary: `${c.name}: ${LIFECYCLE_LABEL[from]} → ${LIFECYCLE_LABEL[to]}. ${summary}`.trim(),
    meta: { campaignId: c.id, from, to },
  });
  return true;
}

export async function applyCampaignAction(workspaceId: string, campaignId: string, action: LifecycleAction): Promise<Campaign> {
  const c = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
  if (!c) throw new LifecycleError("Campaign not found.", 404);
  const d = decide(current(c), action, c.pausedFrom);
  if (!d.ok) throw new LifecycleError(d.reason, 409);
  const moved = await move(c, d.to, "pausedFrom" in d ? { pausedFrom: d.pausedFrom } : {}, "", "user");
  if (!moved) throw new LifecycleError("This campaign changed while you were updating it. Reload and try again.", 409);
  // Resuming lands on the state it was paused in; bring it up to date.
  if (action === "resume") await syncCampaignLifecycle(c.id);
  return prisma.campaign.findUniqueOrThrow({ where: { id: c.id } });
}

/**
 * Re-derive the work state from the campaign's content. Called after content
 * events (review, schedule, publish attempts, manual recording). Never throws:
 * it observes the workflow, it must not break it.
 */
export async function syncCampaignLifecycle(campaignId: string | null | undefined): Promise<Lifecycle | null> {
  if (!campaignId) return null;
  try {
    const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!c) return null;
    const now = current(c);
    const items = await prisma.contentItem.findMany({ where: { campaignId }, select: { status: true } });
    await syncStrategyCycleProgress(c, items.map((i) => i.status));
    if (!shouldDerive(now)) return now;
    const derived = deriveWorkState(items.map((i) => i.status));
    if (!derived || derived === now) return now;
    const moved = await move(c, derived, {}, "Updated from the state of its content.", "system");
    return moved ? derived : now;
  } catch {
    return null;
  }
}

/** Throws 409 when the campaign is in a state where writing content makes no sense. */
export async function assertCampaignAllowsGeneration(workspaceId: string, campaignId: string | null | undefined): Promise<void> {
  if (!campaignId) return;
  const c = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { lifecycle: true } });
  if (!c) return;
  const reason = generationBlocked(current(c));
  if (reason) throw new LifecycleError(reason, 409);
}

/**
 * The campaign that distributes an approved strategy, created on first use.
 * Created approved: the strategy approval is the campaign approval.
 */
/**
 * A strategy-backed cycle has no agent tasks, so its progress is the published share of its drafts
 * (the orchestrator's task-based progress leaves such goals alone).
 */
async function syncStrategyCycleProgress(c: Campaign, statuses: string[]): Promise<void> {
  if (!c.goalId || !c.strategyId) return;
  const tasks = await prisma.agentTask.count({ where: { goalId: c.goalId } });
  if (tasks > 0) return;
  await prisma.goal.updateMany({ where: { id: c.goalId }, data: { progress: strategyCycleProgress(statuses) } });
}

/** The campaign that distributes a strategy, inside its cycle (docs/DECISION_ONE_CYCLE_PIPELINE.md). */
export async function campaignForStrategy(workspaceId: string, strategy: { id: string; version: number; objective: string; body: string }): Promise<Campaign> {
  const campaign = await campaignRowForStrategy(workspaceId, strategy);
  if (campaign.goalId) return campaign;
  const s = await prisma.strategy.findUnique({ where: { id: strategy.id } });
  if (!s) return campaign;
  const goalId = await ensureCycleForStrategy(workspaceId, s, campaign);
  return { ...campaign, goalId };
}

async function campaignRowForStrategy(workspaceId: string, strategy: { id: string; version: number; objective: string; body: string }): Promise<Campaign> {
  const existing = await prisma.campaign.findUnique({ where: { strategyId: strategy.id } });
  if (existing) return existing;
  const body = JSON.parse(strategy.body) as { channels?: { channel: string; formats: string[] }[]; messaging_angles?: { angle: string }[]; kpis?: { metric: string }[] };
  try {
    const created = await prisma.campaign.create({
      data: {
        workspaceId,
        strategyId: strategy.id,
        name: `Strategy v${strategy.version}`,
        objective: strategy.objective || "Distribute the approved strategy",
        targetAudience: "",
        keyMessage: body.messaging_angles?.[0]?.angle ?? "",
        cta: "",
        channels: JSON.stringify((body.channels ?? []).map((c) => c.channel)),
        formats: JSON.stringify((body.channels ?? []).flatMap((c) => c.formats)),
        successMetric: (body.kpis ?? []).map((k) => k.metric).join(", ") || "signups",
        lifecycle: "approved",
        status: legacyStatus("approved"),
      },
    });
    await recordActivity({ workspaceId, type: "campaign", actorType: "system", summary: `Campaign "${created.name}" created from the approved strategy.`, meta: { campaignId: created.id, strategyId: strategy.id } });
    return created;
  } catch {
    // Lost a race on the unique strategyId: use the winner.
    return prisma.campaign.findUniqueOrThrow({ where: { strategyId: strategy.id } });
  }
}
