import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { getBalance } from "@/lib/credits/service";
import { approvalState } from "@/lib/product/profile-review";
import { startNextCycle } from "@/lib/cycle/start-next";
import { parsePolicy } from "./policy";
import { cycleHasEnded, decideContinuous, isOpenCycle } from "./continuous";
import { spotCheckVerdicts } from "./spot-checks";

/**
 * Continuous cycles, applied (R5). Run by the maintenance sweep: for each workspace whose policy turns them
 * on, decide from recorded rows whether the next cycle may start, and start it through the same path as a
 * founder accepting a recommendation. Every start and every stop the founder must act on is an activity row
 * of this type; a stop is told once per cycle and reason, not on every sweep.
 */
export const CONTINUOUS_ACTIVITY = "autonomy_continuous";

export async function runContinuousCycles(now = new Date()): Promise<{ checked: number; started: number; told: number }> {
  // Only workspaces whose stored policy carries a continuous mandate; the decision re-checks everything.
  const workspaces = await prisma.workspace.findMany({
    where: { autonomyPolicy: { contains: '"cycleBudget"' } },
    select: { id: true, autonomyPolicy: true, agentsPausedAt: true },
  });
  let started = 0;
  let told = 0;
  for (const ws of workspaces) {
    const r = await continueWorkspace(ws, now).catch(() => "error" as const);
    if (r === "started") started++;
    if (r === "told") told++;
  }
  return { checked: workspaces.length, started, told };
}

async function continueWorkspace(ws: { id: string; autonomyPolicy: string | null; agentsPausedAt: Date | null }, now: Date): Promise<"started" | "told" | "quiet"> {
  const policy = parsePolicy(ws.autonomyPolicy);
  const recent = await prisma.goal.findMany({ where: { workspaceId: ws.id, status: { not: "cancelled" } }, orderBy: { createdAt: "desc" }, take: 12 });
  const latest = recent[0] ?? null;
  const recommendations = latest
    ? await prisma.recommendation.findMany({ where: { workspaceId: ws.id, goalId: latest.id }, select: { id: true, title: true, rationale: true, confidence: true, status: true, createdAt: true } })
    : [];
  let unattendedStreak = 0;
  for (const g of recent) {
    if (g.source !== "continuous") break;
    unattendedStreak++;
  }
  const since = latest?.createdAt ?? now;
  const [incidents, verdicts, balance] = await Promise.all([
    prisma.activityEvent.count({ where: { workspaceId: ws.id, type: "agent_incident", createdAt: { gte: since } } }),
    spotCheckVerdicts(ws.id, since),
    getBalance(ws.id),
  ]);

  const decision = decideContinuous({
    now,
    policy,
    agentsPaused: Boolean(ws.agentsPausedAt),
    latest: latest ? { goal: latest, recommendations } : null,
    otherOpenCycles: recent.slice(1).filter((g) => isOpenCycle(g.status) && !cycleHasEnded(g, now)).length,
    unattendedStreak,
    incidents,
    stoppedSpotChecks: [...verdicts.values()].filter((v) => v === "stop").length,
    creditsAvailable: balance.available,
  });

  if (!decision.start) {
    if (!decision.tell || !latest) return "quiet";
    return (await tellOnce(ws.id, latest.id, decision.reason)) ? "told" : "quiet";
  }

  // The same gate as a founder starting a cycle: an unapproved product profile stops it.
  const profile = await prisma.productProfile.findUnique({ where: { workspaceId: ws.id }, select: { fieldSources: true, approvedAt: true } });
  const approval = approvalState(profile);
  if (approval.needsApproval) return (await tellOnce(ws.id, latest!.id, `Banyan could not start the next cycle: ${approval.reason}`)) ? "told" : "quiet";

  const rec = recommendations.find((r) => r.id === decision.recommendationId)!;
  const result = await startNextCycle({
    workspaceId: ws.id,
    prev: latest!,
    recommendation: rec,
    source: "continuous",
    createdBy: null,
    creditBudget: decision.budget,
    actorSummary: `policy v${policy.version}`,
    summary: `Banyan started the next cycle of "${latest!.objective}" on its own (cycle ${unattendedStreak + 1} of up to ${policy.continuous!.maxUnattended} in a row, ${decision.budget}-credit budget), changing one thing: ${rec.title}. Its strategy still waits for your approval.`,
  });
  if (!result) return "quiet";
  await recordActivity({
    workspaceId: ws.id,
    type: CONTINUOUS_ACTIVITY,
    actorType: "ai",
    actorSummary: `policy v${policy.version}`,
    summary: `Started the next cycle on its own, with a ${decision.budget}-credit budget.`,
    meta: { kind: "started", goalId: result.goal.id, previousGoalId: latest!.id, recommendationId: rec.id, policyVersion: policy.version },
  });
  return "started";
}

/** Record a stop once per cycle and reason, so a sweep every minute does not repeat it. */
async function tellOnce(workspaceId: string, goalId: string, reason: string): Promise<boolean> {
  const prior = await prisma.activityEvent.findMany({ where: { workspaceId, type: CONTINUOUS_ACTIVITY, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, select: { meta: true } });
  const seen = prior.some((p) => {
    const m = JSON.parse(p.meta || "{}") as { kind?: string; goalId?: string; reason?: string };
    return m.kind === "stopped" && m.goalId === goalId && m.reason === reason;
  });
  if (seen) return false;
  await recordActivity({ workspaceId, type: CONTINUOUS_ACTIVITY, actorType: "ai", summary: reason, meta: { kind: "stopped", goalId, reason } });
  return true;
}
