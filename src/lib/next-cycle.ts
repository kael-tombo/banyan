/**
 * The next cycle — closing the loop (STRATEGY.md §11, output 10 → next input).
 *
 * Accepting a cycle's recommendation starts the next cycle with that one change
 * carried into its constraints. Everything the founder decided last time —
 * objective, metric, target, channels, window length — carries over unchanged,
 * so the planner varies exactly one thing. The new plan still waits for the
 * founder's approval like any other; starting a cycle is not publishing.
 */

export type PreviousGoal = {
  id: string;
  objective: string;
  successMetric: string;
  metricTarget: number | null;
  metricUnit: string | null;
  deadline: Date | null;
  createdAt: Date;
  constraints: string;
};

export type AcceptedRecommendation = { id: string; title: string; rationale: string; confidence: string };

export type NextCycleDraft = {
  objective: string;
  description: string;
  successMetric: string;
  metricTarget: number | null;
  metricUnit: string | null;
  deadline: Date;
  constraints: string;
  rawInput: string;
};

const DAY = 86_400_000;
export const DEFAULT_WINDOW_DAYS = 14;

/** Window length of the previous cycle in whole days (1–365), or the default. */
export function windowDays(prev: Pick<PreviousGoal, "deadline" | "createdAt">): number {
  if (!prev.deadline) return DEFAULT_WINDOW_DAYS;
  const days = Math.round((prev.deadline.getTime() - prev.createdAt.getTime()) / DAY);
  return Math.min(365, Math.max(1, days || DEFAULT_WINDOW_DAYS));
}

/** Constraints minus any change carried from an earlier cycle (only the newest change applies). */
function baseConstraints(constraints: string): string[] {
  return constraints
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c && !/^change from last cycle:/i.test(c));
}

export function nextCycleFrom(prev: PreviousGoal, rec: AcceptedRecommendation, now: Date): NextCycleDraft {
  const change = rec.title.replace(/\s+/g, " ").trim().slice(0, 200);
  const constraints = [...baseConstraints(prev.constraints), `change from last cycle: ${change}`].join("; ").slice(0, 500);
  return {
    objective: prev.objective.slice(0, 300),
    description: `Next cycle after "${prev.objective.slice(0, 120)}". One change, from the last cycle's report (${rec.confidence} confidence): ${change}. Why: ${rec.rationale.replace(/\s+/g, " ").slice(0, 500)}`.slice(0, 1000),
    successMetric: prev.successMetric,
    metricTarget: prev.metricTarget,
    metricUnit: prev.metricUnit,
    deadline: new Date(now.getTime() + windowDays(prev) * DAY),
    constraints,
    rawInput: `Run the next cycle of "${prev.objective.slice(0, 200)}", changing one thing: ${change}`.slice(0, 2000),
  };
}
