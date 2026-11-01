import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";

/**
 * One cycle pipeline, step 1 (docs/DECISION_ONE_CYCLE_PIPELINE.md).
 *
 * The launch path (profile → strategy → drafts → campaign) is the cycle. When a
 * strategy's campaign is created, a Goal is opened as the cycle's container:
 * objective, metric, target, window and channels. That goal never runs the
 * agent orchestrator (it has no tasks); it exists so the cycle cockpit, the
 * cycle report and "next cycle" work on the launch path too.
 */

export const CYCLE_WINDOW_DAYS = 14;

type StrategyBodyLike = { channels?: { channel: string }[]; kpis?: { metric: string; target?: number | null }[] };

export type CycleDraft = {
  objective: string;
  successMetric: string;
  metricTarget: number | null;
  deadline: Date;
  constraints: string;
  rawInput: string;
};

/** The primary KPI: signups when the strategy tracks them (the outcome posts exist for), else its first KPI. */
export function primaryKpi(body: StrategyBodyLike): { metric: string; target: number | null } {
  const kpis = body.kpis ?? [];
  const k = kpis.find((x) => x.metric === "signups") ?? kpis[0];
  return k ? { metric: k.metric, target: typeof k.target === "number" ? k.target : null } : { metric: "signups", target: null };
}

export function cycleDraftFromStrategy(strategy: { version: number; objective: string; body: string }, now: Date): CycleDraft {
  let body: StrategyBodyLike = {};
  try {
    body = JSON.parse(strategy.body) as StrategyBodyLike;
  } catch {
    body = {};
  }
  const kpi = primaryKpi(body);
  const channels = [...new Set((body.channels ?? []).map((c) => c.channel).filter(Boolean))];
  const objective = (strategy.objective || "Distribute the approved strategy").replace(/\s*\(success metric:[^)]*\)\s*$/i, "").slice(0, 300);
  return {
    objective,
    successMetric: kpi.metric,
    metricTarget: kpi.target,
    deadline: new Date(now.getTime() + CYCLE_WINDOW_DAYS * 86_400_000),
    constraints: channels.length ? `channels: ${channels.join(", ")}` : "",
    rawInput: `Cycle for strategy v${strategy.version}: ${objective}`.slice(0, 2000),
  };
}

/**
 * Make sure the strategy's campaign belongs to a cycle. Idempotent:
 *   - the campaign already has a goal → nothing to do;
 *   - the strategy was drafted for a goal (a next cycle) → link the campaign to it;
 *   - otherwise open a new cycle goal from the strategy.
 * Returns the cycle goal id.
 */
export async function ensureCycleForStrategy(
  workspaceId: string,
  strategy: { id: string; version: number; objective: string; body: string; goalId: string | null; approvedById: string | null },
  campaign: { id: string; goalId: string | null }
): Promise<string> {
  if (campaign.goalId) return campaign.goalId;
  let goalId = strategy.goalId;
  if (goalId) {
    await prisma.goal.updateMany({ where: { id: goalId, workspaceId, status: { in: ["draft", "planning"] } }, data: { status: "active" } });
  } else {
    const draft = cycleDraftFromStrategy(strategy, new Date());
    const goal = await prisma.goal.create({
      data: { workspaceId, ...draft, status: "active", source: "user", createdBy: strategy.approvedById },
    });
    goalId = goal.id;
    await prisma.strategy.update({ where: { id: strategy.id }, data: { goalId } });
    await recordActivity({
      workspaceId,
      type: "goal",
      actorType: "system",
      summary: `Cycle opened for strategy v${strategy.version}: "${goal.objective}" (metric: ${goal.successMetric.replace(/_/g, " ")}${goal.metricTarget != null ? `, target ${goal.metricTarget}` : ""}, ${CYCLE_WINDOW_DAYS} days).`,
      meta: { goalId, strategyId: strategy.id, campaignId: campaign.id },
    });
  }
  await prisma.campaign.update({ where: { id: campaign.id }, data: { goalId } });
  return goalId;
}

/** Progress of a strategy-backed cycle: share of its drafts that are published. */
export function strategyCycleProgress(statuses: string[]): number {
  const relevant = statuses.filter((s) => !["rejected", "archived"].includes(s));
  if (!relevant.length) return 0;
  return Math.round((relevant.filter((s) => s === "published").length / relevant.length) * 100);
}
