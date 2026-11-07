/**
 * Activation funnel — blocker 08, US-057/US-058.
 *
 * Each milestone is derived from the row that already records it (no
 * separate event table that could drift), so existing workspaces are
 * covered from day one. Pure: the loader (activation-data.ts) passes the
 * earliest timestamps in; this scores them against STRATEGY.md §11.
 */

export const MILESTONES = [
  { key: "workspace_created", label: "Workspace created" },
  { key: "url_submitted", label: "Product URL submitted" },
  { key: "profile_approved", label: "Product profile approved" },
  { key: "strategy_approved", label: "Strategy approved" },
  { key: "first_asset_approved", label: "First asset approved" },
  { key: "first_publication", label: "First publication (any path)" },
  { key: "first_provider_publication", label: "First provider-confirmed publication" },
  { key: "first_tracked_visit", label: "First tracked visit" },
  { key: "first_attributed_signup", label: "First attributed signup" },
  { key: "first_final_cycle", label: "First cycle with a final report" },
] as const;

export type MilestoneKey = (typeof MILESTONES)[number]["key"];

export type WorkspaceActivationInput = {
  workspaceId: string;
  name: string;
  isSelf: boolean;
  at: Partial<Record<MilestoneKey, Date | null>>;
  providerPublications: number;
};

export type Check = { label: string; threshold: string; result: "pass" | "fail" | "pending" | "not_measured"; detail: string };

export type WorkspaceActivation = {
  workspaceId: string;
  name: string;
  isSelf: boolean;
  milestones: { key: MilestoneKey; label: string; at: Date | null }[];
  reached: number;
  timeToFirstApprovedAssetHours: number | null;
  timeToFirstPublicationHours: number | null;
  checks: Check[];
};

const HOUR = 3_600_000;
const hours = (a: Date, b: Date) => Math.round(((b.getTime() - a.getTime()) / HOUR) * 10) / 10;

export function scoreWorkspace(input: WorkspaceActivationInput, now: Date): WorkspaceActivation {
  const at = (k: MilestoneKey) => input.at[k] ?? null;
  const start = at("url_submitted") ?? at("workspace_created");
  const startLabel = at("url_submitted") ? "intake" : "workspace creation";
  const firstAsset = at("first_asset_approved");
  const firstPub = at("first_publication");
  const outcome = [at("first_tracked_visit"), at("first_attributed_signup")]
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const checks: Check[] = [];

  // §11: time to first approved asset < 24 h from intake.
  if (start && firstAsset) {
    const h = hours(start, firstAsset);
    checks.push({ label: "Time to first approved asset", threshold: "< 24 h from intake", result: h < 24 ? "pass" : "fail", detail: `${h} h` });
  } else if (start) {
    const elapsed = hours(start, now);
    checks.push({ label: "Time to first approved asset", threshold: "< 24 h from intake", result: elapsed < 24 ? "pending" : "fail", detail: `none yet, ${elapsed} h since ${startLabel}` });
  } else {
    checks.push({ label: "Time to first approved asset", threshold: "< 24 h from intake", result: "pending", detail: "no intake yet" });
  }

  // §11: at least two provider-confirmed live publications.
  checks.push({
    label: "Live publications",
    threshold: "≥ 2 provider-confirmed",
    result: input.providerPublications >= 2 ? "pass" : "pending",
    detail: `${input.providerPublications} provider-confirmed`,
  });

  // §11: a recorded visit or signup within 7 days of the first publication.
  if (!firstPub) {
    checks.push({ label: "Tracked outcome", threshold: "≥ 1 visit or signup within 7 days of publishing", result: "pending", detail: "nothing published yet" });
  } else if (outcome && outcome.getTime() - firstPub.getTime() <= 7 * 24 * HOUR) {
    checks.push({ label: "Tracked outcome", threshold: "≥ 1 visit or signup within 7 days of publishing", result: "pass", detail: `${hours(firstPub, outcome)} h after first publication` });
  } else {
    const closed = now.getTime() - firstPub.getTime() > 7 * 24 * HOUR;
    checks.push({
      label: "Tracked outcome",
      threshold: "≥ 1 visit or signup within 7 days of publishing",
      result: closed ? "fail" : "pending",
      detail: outcome ? "first outcome came after the 7-day window" : closed ? "none in 7 days" : "window open",
    });
  }

  // §11: founder active time < 30 min. Nothing records it; say so.
  checks.push({ label: "Founder active time", threshold: "< 30 min per cycle", result: "not_measured", detail: "no source records active time" });

  const milestones = MILESTONES.map((m) => ({ key: m.key, label: m.label, at: at(m.key) }));
  return {
    workspaceId: input.workspaceId,
    name: input.name,
    isSelf: input.isSelf,
    milestones,
    reached: milestones.filter((m) => m.at).length,
    timeToFirstApprovedAssetHours: start && firstAsset ? hours(start, firstAsset) : null,
    timeToFirstPublicationHours: start && firstPub ? hours(start, firstPub) : null,
    checks,
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
}

export type FunnelSummary = {
  workspaces: number;
  stages: { key: MilestoneKey; label: string; reached: number; percent: number }[];
  medianHoursToFirstApprovedAsset: number | null;
  medianHoursToFirstPublication: number | null;
  /** STRATEGY.md primary activation: share publishing through the provider. */
  primaryActivationPercent: number;
  anyPathPublicationPercent: number;
};

export function summarise(rows: WorkspaceActivation[]): FunnelSummary {
  const n = rows.length;
  const pct = (k: number) => (n ? Math.round((k / n) * 1000) / 10 : 0);
  const reachedCount = (key: MilestoneKey) => rows.filter((r) => r.milestones.find((m) => m.key === key)?.at).length;
  return {
    workspaces: n,
    stages: MILESTONES.map((m) => ({ key: m.key, label: m.label, reached: reachedCount(m.key), percent: pct(reachedCount(m.key)) })),
    medianHoursToFirstApprovedAsset: median(rows.map((r) => r.timeToFirstApprovedAssetHours).filter((v): v is number => v !== null)),
    medianHoursToFirstPublication: median(rows.map((r) => r.timeToFirstPublicationHours).filter((v): v is number => v !== null)),
    primaryActivationPercent: pct(reachedCount("first_provider_publication")),
    anyPathPublicationPercent: pct(reachedCount("first_publication")),
  };
}
