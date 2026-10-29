/**
 * The goal's loop, made computable: the five beats of the descent and the
 * learning the loop has kept so far.
 *
 * These are pure assemblers over raw Prisma rows — no IO, no randomness — so
 * the goal page and the approvals page can present the same shape of truth
 * the landing page promises: objective → plan → branches → gated execution →
 * deliverables, with every measured outcome kept as a ring the next plan
 * grows from.
 *
 * Honesty rules encoded here:
 *   - a stage with no work reports "empty", never a fabricated percentage;
 *   - learning rings exist only for decisions that actually happened — a
 *     recorded plan approval, a closed gate, a concluded experiment, an
 *     acted-on (or deliberately dismissed) recommendation;
 *   - "open" recommendations are NOT rings — they are proposals, not kept
 *     learning.
 */

export type StageState = "empty" | "waiting" | "moving" | "done";

export type DescentStageKey = "plan" | "branches" | "gates" | "deliverables" | "learning";

export type DescentStage = {
  key: DescentStageKey;
  label: string;
  hint: string;
  count: number;
  state: StageState;
};

export type DescentInput = {
  /** GoalPlan.status, or null when the planner has not drafted yet. */
  planStatus: string | null;
  /** Tasks in the branches: ready + running right now. */
  runningTasks: number;
  /** Tasks queued behind dependencies (pending) while the plan is approved. */
  queuedTasks: number;
  /** approval_gate tasks waiting on a human decision. */
  waitingGates: number;
  /** Tasks that completed — the deliverables that exist. */
  completedTasks: number;
  /** Open recommendations — proposals waiting to become experiments. */
  openRecommendations: number;
  /** Experiments that concluded with a recorded readout. */
  concludedExperiments: number;
};

export function buildDescent(input: DescentInput): DescentStage[] {
  const planState: StageState =
    input.planStatus == null
      ? "empty"
      : input.planStatus === "approved"
        ? "done"
        : "waiting"; // planned / rejected / superseded — a human decision is needed

  return [
    {
      key: "plan",
      label: "Plan",
      hint:
        input.planStatus == null
          ? "The planner is drafting — nothing is proposed yet"
          : input.planStatus === "approved"
            ? "Approved — recorded with who and when"
            : `Awaiting your decision (${input.planStatus.replace(/_/g, " ")})`,
      count: input.planStatus ? 1 : 0,
      state: planState,
    },
    {
      key: "branches",
      label: "Branches",
      hint:
        input.runningTasks > 0
          ? "Work is running right now"
          : input.queuedTasks > 0
            ? "Queued behind the plan's dependencies"
            : "No branch in motion",
      count: input.runningTasks + input.queuedTasks,
      state: input.runningTasks > 0 ? "moving" : input.queuedTasks > 0 ? "waiting" : "empty",
    },
    {
      key: "gates",
      label: "Gates",
      hint:
        input.waitingGates > 0
          ? "Waiting on your recorded decision"
          : "Nothing is waiting on you — a true zero",
      count: input.waitingGates,
      state: input.waitingGates > 0 ? "waiting" : "done",
    },
    {
      key: "deliverables",
      label: "Deliverables",
      hint:
        input.completedTasks > 0
          ? "Completed work, each with its execution record"
          : "Nothing has completed yet",
      count: input.completedTasks,
      state: input.completedTasks > 0 ? "done" : "empty",
    },
    {
      key: "learning",
      label: "Learning",
      hint:
        input.concludedExperiments + input.openRecommendations > 0
          ? "Measured outcomes and next proposals"
          : "Appears after the first measured outcome",
      count: input.concludedExperiments + input.openRecommendations,
      state: input.concludedExperiments + input.openRecommendations > 0 ? "moving" : "empty",
    },
  ];
}

/** The kinds of kept learning — every ring cites the record it came from. */
export type RingKind = "plan_approved" | "gate_passed" | "experiment_concluded" | "recommendation";

export type LearningRing = {
  kind: RingKind;
  date: Date;
  title: string;
  detail: string;
  /** For recommendations: low | medium | high. */
  confidence?: string;
  /** For recommendations: accepted | acted_upon | dismissed. */
  status?: string;
};

export type RingSource = {
  plan: {
    approvedAt: Date | null;
    /** Display name of the approver, or null when unavailable. */
    approvedByName: string | null;
  } | null;
  /** approval_gate tasks that completed — the human said yes and work passed. */
  gatePasses: { id: string; title: string; completedAt: Date | null; updatedAt: Date }[];
  /** Experiments tied to this goal's campaigns, status "complete". */
  experiments: {
    id: string;
    title: string;
    status: string;
    decidedAt: Date | null;
    updatedAt: Date;
    interpretation: string | null;
  }[];
  /**
   * Recommendations tied to this goal that reached a recorded decision —
   * accepted / acted_upon / dismissed. Open proposals are excluded by the
   * caller; this function treats any other status as open and skips it.
   */
  recommendations: {
    id: string;
    title: string;
    status: string;
    confidence: string;
    updatedAt: Date;
  }[];
};

const RING_DECISION_STATUSES = new Set(["accepted", "acted_upon", "dismissed"]);
const RING_STATUS_LABEL: Record<string, string> = {
  accepted: "accepted into the plan",
  acted_upon: "acted upon",
  dismissed: "deliberately dismissed",
};

export function buildLearningRings(source: RingSource, cap = 8): LearningRing[] {
  const rings: LearningRing[] = [];

  if (source.plan?.approvedAt) {
    rings.push({
      kind: "plan_approved",
      date: source.plan.approvedAt,
      title: "Plan approved",
      detail: source.plan.approvedByName
        ? `Recorded approval by ${source.plan.approvedByName} — execution became authorized.`
        : "Recorded approval — execution became authorized.",
    });
  }

  for (const g of source.gatePasses) {
    rings.push({
      kind: "gate_passed",
      date: g.completedAt ?? g.updatedAt,
      title: "Gate passed",
      detail: `${g.title} — the recorded human decision let this work proceed.`,
    });
  }

  for (const e of source.experiments) {
    rings.push({
      kind: "experiment_concluded",
      date: e.decidedAt ?? e.updatedAt,
      title: "Experiment concluded",
      detail: e.interpretation?.trim()
        ? e.interpretation.trim()
        : `${e.title} concluded — readout recorded, no interpretation drafted yet.`,
    });
  }

  for (const r of source.recommendations) {
    if (!RING_DECISION_STATUSES.has(r.status)) continue; // open proposals are not kept learning
    rings.push({
      kind: "recommendation",
      date: r.updatedAt,
      title: `Recommendation ${RING_STATUS_LABEL[r.status] ?? r.status}`,
      detail: r.title,
      confidence: r.confidence,
      status: r.status,
    });
  }

  return rings.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, cap);
}
