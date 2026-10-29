/**
 * Learning & Results — pure computation behind the /app/results page.
 *
 * Every row on that page answers one question: "which growth work is creating
 * qualified customer outcomes?" — and every value here is derived from
 * recorded first-party data. Where the data cannot answer (no baseline, no
 * signups, no decisions yet), the answer is "unknown"/"no data", never an
 * invented number. Confidence reflects evidence breadth, not statistical
 * power — the UI says so.
 */

import type { AgentRole } from "@/lib/growth-loop";

// ---------------------------------------------------------------------------
// Funnel — tracked visits → signups → activation, with period-over-period
// ---------------------------------------------------------------------------

export type FunnelCounts = { visits: number; signups: number; activated: number };

export type FunnelStage = {
  key: string;
  label: string;
  description: string;
  count: number;
  prevCount: number;
  /** Period-over-period change in percent; null when the previous period was zero (unknown, not 0%). */
  deltaPct: number | null;
  /** Share of the previous stage that reached this one; null when the previous stage is zero. */
  shareOfPrevPct: number | null;
};

const STAGE_DEFS: { key: keyof FunnelCounts; label: string; description: string }[] = [
  { key: "visits", label: "Tracked visits", description: "Clicks recorded through Banyan tracked links." },
  { key: "signups", label: "Signups", description: "Accounts created from tracked traffic or recorded sources." },
  { key: "activated", label: "Activated", description: "Onboarding completed — the first honest quality signal." },
];

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

export function computeFunnelStages(current: FunnelCounts, previous: FunnelCounts): FunnelStage[] {
  const order: (keyof FunnelCounts)[] = ["visits", "signups", "activated"];
  return STAGE_DEFS.map((def, i) => {
    const prevKey = order[Math.max(0, i - 1)];
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      count: current[def.key],
      prevCount: previous[def.key],
      deltaPct: pct(current[def.key] - previous[def.key], previous[def.key]),
      shareOfPrevPct: i === 0 ? null : pct(current[def.key], current[prevKey]),
    };
  });
}

// ---------------------------------------------------------------------------
// Experiment outcomes — recorded verdicts, never projected wins
// ---------------------------------------------------------------------------

export type ExperimentLite = {
  id: string;
  title: string;
  status: string; // planned | running | complete | abandoned
  channel: string | null;
  successMetric: string | null;
  results: string | null;
  interpretation: string | null;
  limitations: string | null;
  nextAction: string | null;
  metricsSnapshot: string | null; // JSON: { clickTotal?, publications?, metrics?: {metric,value,source}[] }
  decidedAt: Date | null;
};

export type ExperimentSignal = "measured" | "running" | "planned" | "abandoned" | "no_data";
export type ExperimentConfidence = "medium" | "low" | "unknown";

export type ExperimentOutcomeRow = {
  id: string;
  title: string;
  status: string;
  channel: string | null;
  /** Recorded numbers from the metrics snapshot, formatted for display. */
  keyResults: string[];
  /** The recorded metric matching the experiment's declared success metric, when identifiable. */
  primaryMetric: { metric: string; value: number; source: string } | null;
  clicks: number | null;
  publications: number | null;
  signal: ExperimentSignal;
  signalDetail: string;
  confidence: ExperimentConfidence;
  /** Verbatim recorded next action — the "agent decision" column. */
  decision: string | null;
  decidedAt: Date | null;
};

type Snapshot = {
  clickTotal?: number;
  publications?: number;
  metrics?: { metric?: string; value?: number; source?: string }[];
};

function parseSnapshot(raw: string | null): Snapshot {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Snapshot;
    return {};
  } catch {
    return {};
  }
}

/**
 * Confidence is evidence breadth, honestly labeled:
 *  - medium: numeric snapshot plus a drafted interpretation;
 *  - low: some recorded evidence (numbers or drafted results), but thin;
 *  - unknown: nothing recorded to base a judgment on.
 * Banyan never claims "high" confidence without a baseline comparison, which
 * the current experiment model does not record.
 */
function confidenceFor(hasNumbers: boolean, hasInterpretation: boolean, hasResults: boolean): ExperimentConfidence {
  if (hasNumbers && hasInterpretation) return "medium";
  if (hasNumbers || hasInterpretation || hasResults) return "low";
  return "unknown";
}

export function experimentOutcomeRows(experiments: ExperimentLite[]): ExperimentOutcomeRow[] {
  return experiments.map((e) => {
    const snap = parseSnapshot(e.metricsSnapshot);
    const metrics = (snap.metrics ?? []).filter(
      (m): m is { metric: string; value: number; source: string } =>
        typeof m.metric === "string" && typeof m.value === "number" && Number.isFinite(m.value)
    );
    const primary =
      (e.successMetric
        ? metrics.find((m) => m.metric.toLowerCase().includes(e.successMetric!.toLowerCase()))
        : undefined) ?? metrics[0] ?? null;

    const keyResults: string[] = [];
    if (typeof snap.clickTotal === "number") keyResults.push(`${snap.clickTotal.toLocaleString()} tracked click(s)`);
    if (typeof snap.publications === "number") keyResults.push(`${snap.publications} confirmed publication(s)`);
    for (const m of metrics.slice(0, 3)) keyResults.push(`${m.metric} = ${m.value} (${m.source}-reported)`);

    let signal: ExperimentSignal;
    let signalDetail: string;
    switch (e.status) {
      case "complete":
        if (primary) {
          signal = "measured";
          signalDetail = `Recorded ${primary.metric} = ${primary.value} on ${snap.clickTotal ?? 0} tracked click(s). Verdict below is the drafted interpretation, not a projection.`;
        } else {
          signal = "no_data";
          signalDetail = "Concluded without a numeric snapshot — read the drafted results.";
        }
        break;
      case "running":
        signal = "running";
        signalDetail = "Still running — no verdict yet, by rule.";
        break;
      case "planned":
        signal = "planned";
        signalDetail = "Not started — no outcomes exist to report.";
        break;
      case "abandoned":
        signal = "abandoned";
        signalDetail = "Abandoned before a conclusion was drafted.";
        break;
      default:
        signal = "no_data";
        signalDetail = `Unrecognized status "${e.status}".`;
    }

    return {
      id: e.id,
      title: e.title,
      status: e.status,
      channel: e.channel,
      keyResults: keyResults.length ? keyResults : e.results ? [e.results.slice(0, 140)] : [],
      primaryMetric: primary,
      clicks: typeof snap.clickTotal === "number" ? snap.clickTotal : null,
      publications: typeof snap.publications === "number" ? snap.publications : null,
      signal,
      signalDetail,
      confidence: confidenceFor(!!primary, !!e.interpretation, !!e.results),
      decision: e.nextAction,
      decidedAt: e.decidedAt,
    };
  });
}

// ---------------------------------------------------------------------------
// What appears to be working — per-campaign first-party funnel, ranked
// ---------------------------------------------------------------------------

export type CampaignFunnelInput = {
  campaignId: string;
  campaignName: string;
  channelLabel: string | null;
  clicks: number;
  signups: number;
  activations: number;
};

export type SignalStrength = "strong" | "moderate" | "early" | "none";

export type ChannelPerformanceRow = CampaignFunnelInput & {
  signalStrength: SignalStrength;
  strengthDetail: string;
};

/**
 * Signal strength thresholds are absolute counts of downstream outcomes, not
 * rates — with first-party volumes this small, a rate on 2 clicks would lie.
 */
export function channelPerformanceRows(inputs: CampaignFunnelInput[]): ChannelPerformanceRow[] {
  const strength = (row: CampaignFunnelInput): { signalStrength: SignalStrength; strengthDetail: string } => {
    if (row.activations >= 5)
      return { signalStrength: "strong", strengthDetail: `${row.activations} activations recorded — strongest honest signal available.` };
    if (row.activations >= 2) return { signalStrength: "moderate", strengthDetail: `${row.activations} activations — consistent, still small.` };
    if (row.activations >= 1) return { signalStrength: "early", strengthDetail: "At least one activation — early signal only." };
    if (row.signups >= 1) return { signalStrength: "early", strengthDetail: "Signups without recorded activation yet." };
    if (row.clicks >= 1) return { signalStrength: "none", strengthDetail: "Clicks recorded, no downstream outcomes yet." };
    return { signalStrength: "none", strengthDetail: "No recorded outcomes yet." };
  };
  return inputs
    .map((r) => ({ ...r, ...strength(r) }))
    .sort((a, b) => b.activations - a.activations || b.signups - a.signups || b.clicks - a.clicks);
}

// ---------------------------------------------------------------------------
// Data health & attribution — connections, coverage, honest gaps
// ---------------------------------------------------------------------------

export type DataHealthStatus = "connected" | "degraded" | "not_connected";

export type DataHealthRow = {
  key: string;
  label: string;
  status: DataHealthStatus;
  detail: string;
};

export function dataHealthRows(input: {
  connections: { label: string; status: string; lastCheckedAt: Date | null }[];
  attributionPct: number | null;
  unattributedSignups: number;
  activationSharePct: number | null;
}): DataHealthRow[] {
  const rows: DataHealthRow[] = [];

  if (input.connections.length === 0) {
    rows.push({
      key: "publishing",
      label: "Publishing provider",
      status: "not_connected",
      detail: "No provider connection. Manual recording with a live URL is always available.",
    });
  }
  for (const c of input.connections) {
    const status: DataHealthStatus = c.status === "verified" ? "connected" : c.status === "error" ? "degraded" : "degraded";
    rows.push({
      key: `conn-${c.label}`,
      label: c.label,
      status,
      detail:
        c.status === "verified"
          ? "Verified against the provider; publications and checks run through it."
          : c.status === "error"
            ? "Last provider check failed — publications through it are blocked until it verifies."
            : "Configured but not yet verified — publications stay blocked until the first successful check.",
    });
  }

  rows.push({
    key: "attribution",
    label: "Signup attribution",
    status: input.attributionPct === null ? "not_connected" : input.attributionPct >= 100 ? "connected" : "degraded",
    detail:
      input.attributionPct === null
        ? "No signups recorded yet — coverage is unknown, not zero."
        : input.unattributedSignups > 0
          ? `${input.attributionPct}% of signups carry a tracked source; ${input.unattributedSignups} arrived unattributed (cleared cookies, direct visits).`
          : "Every recorded signup carries a tracked source.",
  });

  rows.push({
    key: "activation",
    label: "Activation linkage",
    status: input.activationSharePct === null ? "not_connected" : "connected",
    detail:
      input.activationSharePct === null
        ? "No signups to measure activation against yet."
        : `${input.activationSharePct}% of signups completed onboarding — recorded, not inferred.`,
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Recent agent decisions — approvals and conclusions with recorded evidence
// ---------------------------------------------------------------------------

export type DecisionRow = {
  at: Date;
  agent: string;
  agentRole: AgentRole | null;
  action: string;
  evidence: string;
  href: string;
};

export type DecisionInput = {
  plans: { goalId: string; goalObjective: string; summary: string | null; approvedAt: Date | null; approverName: string | null }[];
  experiments: { title: string; nextAction: string | null; interpretation: string | null; decidedAt: Date | null }[];
  recommendations: { title: string; rationale: string; status: string; updatedAt: Date; confidence: number | null }[];
};

const MAX_DECISIONS = 8;

export function recentDecisionRows(input: DecisionInput): DecisionRow[] {
  const rows: DecisionRow[] = [];

  for (const p of input.plans) {
    if (!p.approvedAt) continue;
    rows.push({
      at: p.approvedAt,
      agent: "Planner Agent",
      agentRole: "planner",
      action: `Plan approved for "${p.goalObjective}" — workflow promoted to execution`,
      evidence: p.summary ? p.summary.slice(0, 160) : "Plan summary recorded on the goal.",
      href: `/app/goals/${p.goalId}`,
    });
  }

  for (const e of input.experiments) {
    if (!e.decidedAt) continue;
    rows.push({
      at: e.decidedAt,
      agent: "Analyst Agent",
      agentRole: "analyst",
      action: `Experiment concluded: ${e.title}`,
      evidence: (e.nextAction ?? e.interpretation ?? "Conclusion drafted from recorded outcomes.").slice(0, 160),
      href: "/app/experiments",
    });
  }

  for (const r of input.recommendations) {
    if (r.status !== "accepted" && r.status !== "acted_upon") continue;
    rows.push({
      at: r.updatedAt,
      agent: "Analyst Agent",
      agentRole: "analyst",
      action: `Opportunity ${r.status === "acted_upon" ? "acted on" : "accepted"}: ${r.title}`,
      evidence: r.rationale.slice(0, 160),
      href: "/app/opportunities",
    });
  }

  return rows.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, MAX_DECISIONS);
}
