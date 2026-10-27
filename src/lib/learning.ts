/**
 * Experiment summary: always built from actual recorded observations.
 * Never claims significance; surfaces insufficiency explicitly.
 */

export type Observation = {
  label: string;
  clicks?: number;
  publications?: number;
  metrics: { metric: string; value: number; source: string; recordedAt: string }[];
};

export type LearningSummary = {
  observations: string[];
  verdict: "not_enough_data" | "evidence_against" | "evidence_for" | "inconclusive";
  interpretationDraft: string;
  limitationsDraft: string;
  nextActionDraft: string;
};

export function summarizeObservations(hypothesis: string, obs: Observation[], runningTotals: { clicks: number }): LearningSummary {
  const lines: string[] = [];
  const measured = obs.filter((o) => (o.clicks ?? 0) > 0 || o.metrics.length > 0 || (o.publications ?? 0) > 0);

  for (const o of obs) {
    const parts: string[] = [];
    if (o.publications !== undefined) parts.push(`${o.publications} confirmed publication(s)`);
    if (o.clicks !== undefined) parts.push(`${o.clicks} tracked click(s)`);
    o.metrics.forEach((m) => parts.push(`${m.metric}=${m.value} (${m.source}-reported)`));
    lines.push(`${o.label}: ${parts.length ? parts.join(", ") : "no recorded outcomes yet"}`);
  }

  if (measured.length === 0 || runningTotals.clicks < 30) {
    return {
      observations: lines,
      verdict: "not_enough_data",
      interpretationDraft: `Not enough evidence yet to evaluate "${hypothesis}". Recorded so far: ${runningTotals.clicks} tracked click(s). Keep the experiment running before drawing conclusions.`,
      limitationsDraft: `Small observed sample (${runningTotals.clicks} clicks). No comparison group or statistical testing performed; individual visits may be misattributed.`,
      nextActionDraft: "Keep collecting data, or narrow the hypothesis and re-run with a clearly defined success threshold agreed in advance.",
    };
  }

  return {
    observations: lines,
    verdict: "inconclusive",
    interpretationDraft: `Some signal exists (${runningTotals.clicks} tracked clicks), but without a control group this is correlation, not proof. Evaluate against the hypothesis qualitatively and define the next decision.`,
    limitationsDraft: "Observational only: no A/B randomization, confounding from follower counts and time-of-day, and click counts may include bot traffic.",
    nextActionDraft: "Form one specific follow-up experiment with a pre-declared threshold before looking at results again.",
  };
}
