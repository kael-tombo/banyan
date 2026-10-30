/**
 * Learning memory — what the loop has actually concluded, turned into
 * reusable context for the next plan.
 *
 * The Experiment table is the single source of truth: an experiment counts as
 * memory only when it is complete AND a human (or the analyst agent) recorded
 * an interpretation. A completed experiment with no interpretation is a data
 * point without a conclusion — it is not learning, and it is not injected.
 *
 * Nothing here invents numbers or significance. The line states the recorded
 * conclusion verbatim (trimmed), the limitations as recorded, and the next
 * action as recorded; missing pieces are named as missing.
 */

export type LearningExperiment = {
  id: string;
  title: string;
  hypothesis: string;
  variable: string;
  successMetric: string;
  status: string;
  results: string | null;
  interpretation: string | null;
  limitations: string | null;
  nextAction: string | null;
  decidedAt: Date | null;
  updatedAt: Date;
};

/** How many concluded experiments are offered as reusable memory. */
export const LEARNING_MEMORY_LIMIT = 6;

/** Prompt lines stay bounded — a long conclusion is trimmed, never dropped. */
const PROMPT_LINE_LIMIT = 460;

const normalize = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

/** Trim to a bound without cutting a word in half. */
const clean = (value: string | null | undefined, max: number): string => {
  const text = normalize(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(0, max - 1));
  const lastSpace = cut.lastIndexOf(" ");
  const bounded = lastSpace > Math.floor(max * 0.6) ? cut.slice(0, lastSpace) : cut;
  return `${bounded.trimEnd()}…`;
};

/** Join segments without exceeding the budget or trailing a bare separator. */
function joinBounded(parts: string[], max: number): string {
  let out = "";
  for (const part of parts) {
    if (!part) continue;
    const candidate = out ? `${out} | ${part}` : part;
    if (candidate.length <= max) {
      out = candidate;
      continue;
    }
    const room = max - out.length - (out ? 3 : 0) - 1;
    if (room >= 12) out = `${out}${out ? " | " : ""}${clean(part, room)}`;
    break;
  }
  return out;
}

/** Complete + interpreted = a conclusion the next plan can actually reuse. */
export function isConcludedLearning(
  experiment: Pick<LearningExperiment, "status" | "interpretation">
): boolean {
  return experiment.status === "complete" && normalize(experiment.interpretation).length > 0;
}

/** Most recent conclusion first; decidedAt falls back to updatedAt. */
export function learningAt(experiment: Pick<LearningExperiment, "decidedAt" | "updatedAt">): number {
  return (experiment.decidedAt ?? experiment.updatedAt).getTime();
}

/**
 * Concluded experiments, newest first, bounded. A deterministic tie-break on
 * id keeps the order stable when two conclusions share a timestamp.
 */
export function orderConcludedLearning<T extends LearningExperiment>(
  experiments: T[],
  limit = LEARNING_MEMORY_LIMIT
): T[] {
  return experiments
    .filter(isConcludedLearning)
    .slice()
    .sort((a, b) => learningAt(b) - learningAt(a) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}

/**
 * One prompt-ready line. The block that renders it labels these as recorded
 * conclusions; the line itself never upgrades an inconclusive result into
 * proof — it repeats the recorded interpretation and limits.
 */
export function learningLine(experiment: LearningExperiment): string {
  const title = clean(experiment.title, 110) || "Untitled experiment";
  const hypothesis = clean(experiment.hypothesis, 150);
  const variable = clean(experiment.variable, 90);
  const metric = clean(experiment.successMetric, 70);
  const interpretation = clean(experiment.interpretation, 220);
  const limitations = clean(experiment.limitations, 150);
  const nextAction = clean(experiment.nextAction, 110);

  const parts = [
    `"${title}"`,
    `tested: ${hypothesis || "hypothesis not recorded"}`,
    variable ? `variable: ${variable}` : "",
    metric ? `metric: ${metric}` : "",
    `conclusion: ${interpretation}`,
    `limits: ${limitations || "none recorded"}`,
    `next: ${nextAction || "not recorded"}`,
  ].filter(Boolean);

  return joinBounded(parts, PROMPT_LINE_LIMIT);
}

/** Prompt lines for the newest concluded experiments. */
export function priorLearningLines(experiments: LearningExperiment[], limit = LEARNING_MEMORY_LIMIT): string[] {
  return orderConcludedLearning(experiments, limit).map(learningLine);
}

export type LearningMemoryEntry = {
  id: string;
  title: string;
  hypothesis: string;
  variable: string;
  successMetric: string;
  interpretation: string;
  limitations: string | null;
  nextAction: string | null;
  decidedAt: Date;
};

/** Inspectable shape for the Business context page — fuller text than a prompt line. */
export function learningMemory(
  experiments: LearningExperiment[],
  limit = LEARNING_MEMORY_LIMIT
): LearningMemoryEntry[] {
  return orderConcludedLearning(experiments, limit).map((e) => ({
    id: e.id,
    title: clean(e.title, 180) || "Untitled experiment",
    hypothesis: clean(e.hypothesis, 400),
    variable: clean(e.variable, 160),
    successMetric: clean(e.successMetric, 120),
    interpretation: clean(e.interpretation, 900),
    limitations: clean(e.limitations, 400) || null,
    nextAction: clean(e.nextAction, 300) || null,
    decidedAt: e.decidedAt ?? e.updatedAt,
  }));
}
