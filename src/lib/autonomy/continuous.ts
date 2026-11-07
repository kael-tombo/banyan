import { isSupervised, type AutonomyPolicy } from "./policy";

/**
 * Continuous cycles — R5, the first piece of Level 3 (STRATEGY.md §12: "continuous cycles within explicit
 * policy, budget and rate limits; sampling; incident review; human override; stop everything in one action").
 *
 * When a cycle has ended and its report recommends a change with enough confidence, Banyan may start the
 * next cycle itself, exactly as if the founder had accepted that recommendation, but with the policy's
 * credit budget on it. Pure, so every stopping rule is tested. Each rule that stops says why, and the
 * stops a person must act on are told to the founder.
 *
 * What does not change: the next cycle's strategy (or plan) still waits for the founder's approval, and its
 * drafts still go through the supervised policy. Starting a cycle is not publishing.
 */

/** More incidents than this in the last cycle and Banyan stops starting cycles until a person reviews them. */
export const MAX_INCIDENTS_PER_CYCLE = 2;

export type CycleCandidate = {
  goal: { id: string; status: string; deadline: Date | null; createdAt: Date };
  recommendations: { id: string; status: string; confidence: string; createdAt: Date }[];
};

export type ContinuousInput = {
  now: Date;
  policy: AutonomyPolicy;
  agentsPaused: boolean;
  /** The workspace's most recent cycle (goal). */
  latest: CycleCandidate | null;
  /** Other cycles still open (draft through paused) besides the latest. */
  otherOpenCycles: number;
  /** How many of the most recent cycles in a row Banyan started without a person. */
  unattendedStreak: number;
  /** Agent incidents recorded during the latest cycle. */
  incidents: number;
  /** Spot checks during the latest cycle where the founder said the post should not have gone out. */
  stoppedSpotChecks: number;
  creditsAvailable: number;
};

export type ContinuousDecision =
  | { start: true; recommendationId: string; budget: number }
  /** quiet: nothing to do yet (or nothing changed); tell: the founder must act before cycles continue. */
  | { start: false; reason: string; tell: boolean };

const CONFIDENCE_RANK: Record<string, number> = { high: 2, medium: 1 };

const ENDED = new Set(["achieved", "missed"]);
const OPEN = new Set(["draft", "planning", "awaiting_approval", "active", "paused"]);

export function cycleHasEnded(goal: CycleCandidate["goal"], now: Date): boolean {
  if (ENDED.has(goal.status)) return true;
  return goal.status === "active" && goal.deadline != null && goal.deadline.getTime() <= now.getTime();
}

export function decideContinuous(input: ContinuousInput): ContinuousDecision {
  const { policy, latest } = input;
  const quiet = (reason: string): ContinuousDecision => ({ start: false, reason, tell: false });
  const tell = (reason: string): ContinuousDecision => ({ start: false, reason, tell: true });

  if (!policy.continuous || !isSupervised(policy)) return quiet("Continuous cycles are off.");
  if (input.agentsPaused) return quiet("Agents are paused.");
  if (!latest) return quiet("No cycle has run yet.");
  if (!cycleHasEnded(latest.goal, input.now)) return quiet("The current cycle is still running.");
  // A cycle whose recommendation was already acted on has a successor (or a person chose one): nothing to start.
  if (latest.recommendations.some((r) => r.status === "acted_upon")) return quiet("The next cycle has already started.");
  if (input.otherOpenCycles > 0) return quiet("Another cycle is still open; Banyan runs one at a time.");

  const open = latest.recommendations.filter((r) => r.status === "open" || r.status === "accepted");
  if (open.length === 0) return quiet("The cycle report has no recommendation yet.");

  if (input.unattendedStreak >= policy.continuous.maxUnattended) {
    return tell(`Banyan has started ${input.unattendedStreak} cycles in a row on its own, the most your policy allows. Start the next one yourself to continue.`);
  }
  if (input.incidents > MAX_INCIDENTS_PER_CYCLE) {
    return tell(`The last cycle had ${input.incidents} agent incidents. Review them in Activity, then start the next cycle yourself.`);
  }
  if (input.stoppedSpotChecks > 0) {
    return tell(`In a spot check during the last cycle you said a post should not have gone out, so Banyan will not start the next cycle on its own.`);
  }
  const confident = open
    .filter((r) => CONFIDENCE_RANK[r.confidence] != null)
    .sort((a, b) => CONFIDENCE_RANK[b.confidence]! - CONFIDENCE_RANK[a.confidence]! || a.createdAt.getTime() - b.createdAt.getTime());
  if (confident.length === 0) {
    return tell("The last cycle's recommendations are all low-confidence, which needs your judgment. Choose one to start the next cycle.");
  }
  const budget = policy.continuous.cycleBudget;
  if (input.creditsAvailable < budget) {
    return tell(`The next cycle's budget is ${budget} credits and ${input.creditsAvailable} are available. Add credits or lower the budget.`);
  }
  return { start: true, recommendationId: confident[0]!.id, budget };
}

/** Exported for the service: which goal statuses count as an open cycle. */
export function isOpenCycle(status: string): boolean {
  return OPEN.has(status);
}
