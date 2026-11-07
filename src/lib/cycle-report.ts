/**
 * The cycle report — blocker 05 / STRATEGY.md §11 output 9.
 *
 * Pure: takes the rows of one cycle (a goal and its campaigns) and returns what
 * shipped, what it produced, what cannot be attributed, how the objective
 * stands, and the one thing to change next. Every number is a count of rows
 * passed in; when there is no row there is no number ("not measured"), which
 * is shown differently from a measured zero.
 */

export type ReportItem = {
  id: string;
  channel: string;
  format: string;
  title: string;
  status: string;
  approvedAt: Date | null;
  approvedBy: string | null;
};

export type ReportPublication = {
  contentItemId: string;
  status: string;
  manual: boolean;
  externalUrl: string | null;
  publishedAt: Date | null;
};

export type ReportLink = { id: string; slug: string; contentItemId: string | null; clicks: number };

export type ReportMetric = { metric: string; value: number; source: string; recordedAt: Date };

export type ReportInput = {
  now: Date;
  goal: {
    objective: string;
    successMetric: string;
    metricTarget: number | null;
    metricUnit: string | null;
    deadline: Date | null;
    createdAt: Date;
  };
  items: ReportItem[];
  publications: ReportPublication[];
  links: ReportLink[];
  /** First-party signups attributed to each tracked link (MetricEvent type "signup"). */
  linkSignups: Record<string, number>;
  /** Campaign metrics recorded by hand or reported by a provider. */
  metrics: ReportMetric[];
  recommendation: {
    title: string;
    rationale: string;
    confidence: string;
    uncertainty: string;
    evidence: { source?: string; ref?: string; summary?: string }[];
  } | null;
  isManualChannel: (channel: string) => boolean;
};

export type ShippedState = "provider" | "manual" | "handoff" | "approved_unpublished" | "not_approved";

export type ShippedRow = {
  contentId: string;
  channel: string;
  format: string;
  title: string;
  state: ShippedState;
  approvedBy: string | null;
  url: string | null;
  publishedAt: Date | null;
  link: { slug: string; clicks: number; signups: number } | null;
};

export type ObjectiveStatus = "met" | "in_progress" | "missed" | "no_target" | "unmeasured";

export type CycleReport = {
  window: { start: Date; end: Date | null; daysRemaining: number | null; closed: boolean };
  final: boolean;
  shipped: ShippedRow[];
  produced: {
    /** null = no tracked link exists, so visits are not measured (not zero). */
    visits: number | null;
    /** null = no first-party signup source for this cycle. */
    trackedSignups: number | null;
    recorded: { metric: string; total: number; entries: number; source: string }[];
  };
  objective: {
    metric: string;
    target: number | null;
    unit: string | null;
    actual: number | null;
    basis: string;
    status: ObjectiveStatus;
  };
  notAttributable: string[];
  next:
    | { kind: "proposal"; title: string; rationale: string; confidence: string; uncertainty: string; evidence: { source?: string; ref?: string; summary?: string }[] }
    | { kind: "none"; reason: string };
};

const DAY = 24 * 60 * 60 * 1000;

const CHANNEL_NAMES: Record<string, string> = { x: "X", linkedin: "LinkedIn", shortvideo: "Short-form video" };
export const channelName = (c: string) => CHANNEL_NAMES[c] ?? c;

const VISIT_METRICS = ["visits", "visit", "tracked_visits", "clicks", "link_clicks", "traffic"];
const PUBLICATION_METRICS = ["publications", "posts", "posts_published"];
const SIGNUP_METRICS = ["signups", "signup", "sign_ups", "registrations"];

function normalise(metric: string): string {
  return metric.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function shippedState(item: ReportItem, pubs: ReportPublication[], manualChannel: boolean): { state: ShippedState; pub: ReportPublication | null } {
  const published = pubs.filter((p) => p.status === "published");
  const provider = published.find((p) => !p.manual);
  if (provider) return { state: "provider", pub: provider };
  const manual = published.find((p) => p.manual);
  if (manual) return { state: "manual", pub: manual };
  const approved = Boolean(item.approvedAt) || ["approved", "scheduled", "published"].includes(item.status);
  if (!approved) return { state: "not_approved", pub: null };
  return { state: manualChannel ? "handoff" : "approved_unpublished", pub: null };
}

export function buildCycleReport(input: ReportInput): CycleReport {
  const { goal, now } = input;
  const end = goal.deadline;
  const closed = Boolean(end && end.getTime() <= now.getTime());
  const daysRemaining = end && !closed ? Math.ceil((end.getTime() - now.getTime()) / DAY) : end ? 0 : null;

  const pubsByItem = new Map<string, ReportPublication[]>();
  for (const p of input.publications) pubsByItem.set(p.contentItemId, [...(pubsByItem.get(p.contentItemId) ?? []), p]);
  const linkByItem = new Map<string, ReportLink>();
  for (const l of input.links) if (l.contentItemId && !linkByItem.has(l.contentItemId)) linkByItem.set(l.contentItemId, l);

  const shipped: ShippedRow[] = input.items.map((item) => {
    const { state, pub } = shippedState(item, pubsByItem.get(item.id) ?? [], input.isManualChannel(item.channel));
    const link = linkByItem.get(item.id);
    return {
      contentId: item.id,
      channel: item.channel,
      format: item.format,
      title: item.title,
      state,
      approvedBy: item.approvedBy,
      url: pub?.externalUrl ?? null,
      publishedAt: pub?.publishedAt ?? null,
      link: link ? { slug: link.slug, clicks: link.clicks, signups: input.linkSignups[link.id] ?? 0 } : null,
    };
  });

  // ── produced ──
  const visits = input.links.length ? input.links.reduce((s, l) => s + l.clicks, 0) : null;
  const trackedSignups = input.links.length ? input.links.reduce((s, l) => s + (input.linkSignups[l.id] ?? 0), 0) : null;
  const grouped = new Map<string, { metric: string; total: number; entries: number; source: string }>();
  for (const m of input.metrics) {
    const key = `${normalise(m.metric)}|${m.source}`;
    const g = grouped.get(key) ?? { metric: normalise(m.metric), total: 0, entries: 0, source: m.source };
    g.total += m.value;
    g.entries += 1;
    grouped.set(key, g);
  }
  const recorded = [...grouped.values()].sort((a, b) => a.metric.localeCompare(b.metric));
  const recordedTotal = (names: string[]) => {
    const rows = recorded.filter((r) => names.includes(r.metric));
    return rows.length ? rows.reduce((s, r) => s + r.total, 0) : null;
  };

  // ── objective ──
  const metric = normalise(goal.successMetric);
  let actual: number | null = null;
  let basis = "";
  if (SIGNUP_METRICS.includes(metric)) {
    const manual = recordedTotal(SIGNUP_METRICS);
    if (trackedSignups !== null || manual !== null) {
      actual = (trackedSignups ?? 0) + (manual ?? 0);
      basis = [trackedSignups !== null && `${trackedSignups} through tracked links`, manual !== null && `${manual} recorded by hand`].filter(Boolean).join(" + ");
    }
  } else if (VISIT_METRICS.includes(metric)) {
    const manual = recordedTotal(VISIT_METRICS);
    if (visits !== null || manual !== null) {
      actual = (visits ?? 0) + (manual ?? 0);
      basis = [visits !== null && `${visits} tracked-link visits`, manual !== null && `${manual} recorded by hand`].filter(Boolean).join(" + ");
    }
  } else if (PUBLICATION_METRICS.includes(metric)) {
    actual = shipped.filter((s) => s.state === "provider" || s.state === "manual").length;
    basis = `${actual} published (confirmed by the platform or recorded by you)`;
  } else {
    const manual = recordedTotal([metric]);
    if (manual !== null) {
      actual = manual;
      basis = `recorded ${metric.replace(/_/g, " ")}`;
    }
  }
  let status: ObjectiveStatus;
  if (actual === null) status = "unmeasured";
  else if (goal.metricTarget === null) status = "no_target";
  else if (actual >= goal.metricTarget) status = "met";
  else status = closed ? "missed" : "in_progress";
  if (actual === null) basis = `Nothing measures "${goal.successMetric}" for this cycle yet.`;

  // ── what cannot be attributed ──
  const notAttributable: string[] = [];
  for (const row of shipped) {
    const name = `${channelName(row.channel)} ${row.format}`;
    if ((row.state === "provider" || row.state === "manual") && !row.link) {
      notAttributable.push(`The ${name} went live without a tracked link, so visits from it cannot be counted.`);
    }
    if (row.state === "manual") {
      notAttributable.push(`The ${name} was published by hand; Banyan has your recorded URL but no confirmation from the platform.`);
    }
    if (row.state === "handoff") {
      notAttributable.push(`The ${name} was prepared for you to publish; no live URL has been recorded, so it cannot be measured.`);
    }
    if (row.state === "approved_unpublished") {
      notAttributable.push(`The ${name} is approved but not published, so it has produced nothing yet.`);
    }
  }
  if (SIGNUP_METRICS.includes(metric) && trackedSignups === 0 && recordedTotal(SIGNUP_METRICS) === null) {
    notAttributable.push(
      "No signup has been recorded. Banyan counts a signup only when your product reports it through a tracked link, or when you record it by hand on the campaign."
    );
  }
  if (!recorded.some((r) => r.source === "provider")) {
    notAttributable.push("Platform engagement (impressions, likes, comments) is not collected for this cycle.");
  }
  if (!closed && end) {
    notAttributable.push(`The measurement window is still open (${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left); these numbers can still change.`);
  }
  if (!end) {
    notAttributable.push("This cycle has no end date, so the report can never be final.");
  }

  // ── next move ──
  const next: CycleReport["next"] = input.recommendation
    ? { kind: "proposal", ...input.recommendation }
    : {
        kind: "none",
        reason:
          visits === null && trackedSignups === null && recorded.length === 0
            ? "Not enough data: nothing from this cycle has been measured, so there is no evidence to base a next move on."
            : "No next move has been proposed yet. Banyan proposes one after it evaluates the measured results.",
      };

  return {
    window: { start: goal.createdAt, end, daysRemaining, closed },
    final: closed,
    shipped,
    produced: { visits, trackedSignups, recorded },
    objective: { metric: goal.successMetric, target: goal.metricTarget, unit: goal.metricUnit, actual, basis, status },
    notAttributable,
    next,
  };
}
