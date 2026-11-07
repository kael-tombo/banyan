import type { Goal } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { startGoalWorkflow } from "@/lib/agents/orchestrator";
import { triggerAutopilot } from "@/lib/agents/autopilot";
import { nextCycleFrom } from "@/lib/next-cycle";

/**
 * Start the next cycle from one recommendation of the previous one. Shared by the founder accepting a
 * recommendation and by continuous cycles (R5), so both start cycles the same way.
 *
 * The recommendation is claimed first: a double click, a second tab or two sweeps at once cannot start
 * two cycles. Returns null when it was already acted on.
 */
export async function startNextCycle(input: {
  workspaceId: string;
  prev: Goal;
  recommendation: { id: string; title: string; rationale: string; confidence: string };
  source: "user" | "continuous";
  createdBy: string | null;
  creditBudget?: number | null;
  actorSummary: string;
  summary: string;
}): Promise<{ goal: Goal; path: "strategy" | "workflow" } | null> {
  const claimed = await prisma.recommendation.updateMany({
    where: { id: input.recommendation.id, workspaceId: input.workspaceId, status: { in: ["open", "accepted"] } },
    data: { status: "acted_upon" },
  });
  if (claimed.count !== 1) return null;

  const draft = nextCycleFrom(input.prev, input.recommendation, new Date());
  const goal = await prisma.goal.create({
    data: {
      workspaceId: input.workspaceId,
      ...draft,
      status: "planning",
      source: input.source,
      createdBy: input.createdBy,
      creditBudget: input.creditBudget ?? null,
    },
  });
  await recordActivity({
    workspaceId: input.workspaceId,
    type: "goal",
    actorType: input.source === "user" ? "user" : "ai",
    actorSummary: input.actorSummary,
    summary: input.summary,
    meta: { goalId: goal.id, previousGoalId: input.prev.id, recommendationId: input.recommendation.id, source: input.source },
  });
  // One pipeline (docs/DECISION_ONE_CYCLE_PIPELINE.md): a cycle that ran on a strategy continues on one —
  // the strategist drafts the next strategy with the change, for approval. Older goal-run cycles keep their workflow.
  const strategyBacked = (await prisma.campaign.count({ where: { goalId: input.prev.id, strategyId: { not: null } } })) > 0;
  if (strategyBacked) await triggerAutopilot({ kind: "cycle_strategy", workspaceId: input.workspaceId, goalId: goal.id });
  else await startGoalWorkflow(goal.id, input.workspaceId);
  return { goal, path: strategyBacked ? "strategy" : "workflow" };
}
