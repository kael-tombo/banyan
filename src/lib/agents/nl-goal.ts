/**
 * Natural-language goal parsing — deterministic, pure heuristics.
 *
 * Used two ways:
 *  1. As the honest fallback when no live model is configured (labelled as
 *     heuristic parsing in the plan's generatedMeta);
 *  2. As validation/normalization of the model's structured extraction, so a
 *     hallucinated date or metric can still be corrected against what the
 *     user actually wrote.
 */

export type ParsedGoal = {
  objective: string;
  successMetric: string;
  metricTarget: number | null;
  metricUnit: string | null;
  deadline: string | null; // ISO date (yyyy-mm-dd) when confidently parsed
  constraints: string[];
  channels: string[]; // channel keys mentioned
  cleaned: string; // objective with extracted specifics removed
};

const METRIC_KEYWORDS: { pattern: RegExp; metric: string; unit: string }[] = [
  { pattern: /\b(waitlist)\s+(signups?|sign\s?ups?|members?)\b/i, metric: "waitlist_signups", unit: "signups" },
  { pattern: /\b(sign\s?ups?|signups?|registrations?|members?)\b/i, metric: "signups", unit: "signups" },
  { pattern: /\b(qualified\s+)?leads?\b/i, metric: "qualified_leads", unit: "leads" },
  { pattern: /\b(customers?|paying\s+users?|sales?|conversions?)\b/i, metric: "conversions", unit: "customers" },
  { pattern: /\b(users?|activations?|activated\s+users?)\b/i, metric: "activations", unit: "users" },
  { pattern: /\b(qualified\s+)?visits?\b/i, metric: "qualified_visits", unit: "visits" },
  { pattern: /\b(link\s+)?clicks?\b/i, metric: "link_clicks", unit: "clicks" },
  { pattern: /\bfollowers?\b/i, metric: "followers", unit: "followers" },
  { pattern: /\b(impressions?|views?)\b/i, metric: "impressions", unit: "impressions" },
  { pattern: /\b(?:short\s+)?videos?\b|\b(?:shorts?|reels?)\b/i, metric: "published_posts", unit: "posts" },
  { pattern: /\b(posts? published|published posts)\b/i, metric: "published_posts", unit: "posts" },
];

const CHANNEL_KEYWORDS: { pattern: RegExp; channel: string }[] = [
  { pattern: /\b(x|twitter)\b/i, channel: "x" },
  { pattern: /\blinkedin\b/i, channel: "linkedin" },
  { pattern: /\b(short[- ]?form( video)?|shorts?|tiktok|reels?|video)\b/i, channel: "shortvideo" },
];

const CONSTRAINT_PATTERNS: RegExp[] = [
  /\b(no|without|zero)\s+paid\s+(ads?|promotion|spend)/i,
  /\b(only\s+)?organic\s+(only|growth|reach)/i,
  /\bbudget\s+(of\s+)?\$?\d[\d,]*(\.\d+)?/i,
  /\b(no\s+more\s+than\s+\d+\s*(hours?|h|hrs?)\s*(\/|per\s*)?\s*week)/i,
  /\b(\d+\s*(hours?|h|hrs?)\s*(\/|per\s*)?\s*week)\b/i,
  /\b(bootstrapped|pre[- ]?launch|b2b only|b2c only)/i,
];

function parseNumber(raw: string): number {
  return Number(raw.replace(/[,$_\s]/g, ""));
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function toISODate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

/** Extract a deadline. Returns the ISO date and the matched text (to strip). */
export function extractDeadline(text: string, now = new Date()): { iso: string; matched: string } | null {
  // ISO or numeric dates: 2026-12-15, 15/12/2026, 12/15/2026
  let m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) {
    const iso = toISODate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) return { iso, matched: m[0] };
  }
  m = text.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/);
  if (m) {
    // Prefer D/M/Y when the first component is > 12, else M/D/Y.
    const a = Number(m[1]);
    const b = Number(m[2]);
    const iso = a > 12 ? toISODate(Number(m[3]), b, a) : toISODate(Number(m[3]), a, b);
    if (iso) return { iso, matched: m[0] };
  }
  // "by/before/until <Month> <day>[, <year>]" or "<day> <Month>"
  m = text.match(/\b(?:by|before|until|due)\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
  if (m) {
    const month = MONTHS.findIndex((mo) => mo.startsWith(m![1].toLowerCase()));
    if (month >= 0) {
      const year = m[3] ? Number(m[3]) : guessYear(month + 1, Number(m[2]), now);
      const iso = toISODate(year, month + 1, Number(m[2]));
      if (iso) return { iso, matched: m[0] };
    }
  }
  // "in <N> days/weeks/months" (also "in the next N weeks")
  m = text.match(/\bin\s+(?:the\s+)?(?:next\s+)?(\d+)\s+(day|week|month)s?\b/i);
  if (m) {
    const n = Number(m[1]);
    const d = new Date(now.getTime());
    if (/day/i.test(m[2])) d.setUTCDate(d.getUTCDate() + n);
    if (/week/i.test(m[2])) d.setUTCDate(d.getUTCDate() + n * 7);
    if (/month/i.test(m[2])) d.setUTCMonth(d.getUTCMonth() + n);
    return { iso: d.toISOString().slice(0, 10), matched: m[0] };
  }
  // "end of <month>" / "end of the month"
  m = text.match(/\bend\s+of\s+(?:the\s+)?month\b/i) ?? text.match(/\bend\s+of\s+([A-Za-z]+)\b/i);
  if (m) {
    const monthName = m[1]?.toLowerCase();
    if (!monthName || monthName === "month") {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      return { iso: d.toISOString().slice(0, 10), matched: m[0] };
    }
    const month = MONTHS.findIndex((mo) => mo.startsWith(monthName));
    if (month >= 0) {
      const year = guessYear(month + 1, 28, now);
      const d = new Date(Date.UTC(year, month + 1, 0));
      return { iso: d.toISOString().slice(0, 10), matched: m[0] };
    }
  }
  // "Q1..Q4" → last day of that quarter
  m = text.match(/\bQ([1-4])\s*(\d{4})?\b/i);
  if (m) {
    const q = Number(m[1]);
    const year = m[2] ? Number(m[2]) : now.getUTCFullYear();
    const monthEnd = q * 3;
    const d = new Date(Date.UTC(year, monthEnd, 0));
    return { iso: d.toISOString().slice(0, 10), matched: m[0] };
  }
  return null;
}

function guessYear(month: number, day: number, now: Date): number {
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day));
  if (candidate.getTime() < now.getTime() - 86_400_000) return now.getUTCFullYear() + 1;
  return now.getUTCFullYear();
}

export function parseGoalInput(raw: string, now = new Date()): ParsedGoal {
  const text = raw.trim();
  let cleaned = text;

  // Deadline
  const deadline = extractDeadline(text, now);
  if (deadline) cleaned = cleaned.replace(deadline.matched, "");

  // Metric + target: "<number> <metric keyword>" (number may precede or follow)
  let successMetric = "";
  let metricUnit: string | null = null;
  let metricTarget: number | null = null;
  for (const kw of METRIC_KEYWORDS) {
    const numFirst = text.match(new RegExp(`\\b([\\d][\\d,_\\. ]*)\\s+${kw.pattern.source}`, "i"));
    const wordFirst = text.match(new RegExp(`${kw.pattern.source}\\s+(?:of|at|to)?\\s*([\\d][\\d,_\\. ]*)`, "i"));
    const hit = numFirst ?? wordFirst;
    if (hit) {
      successMetric = kw.metric;
      metricUnit = kw.unit;
      metricTarget = parseNumber(hit[1] ?? hit[2] ?? "");
      break;
    }
    if (!successMetric && kw.pattern.test(text)) {
      successMetric = kw.metric;
      metricUnit = kw.unit;
    }
  }
  if (metricTarget !== null && Number.isNaN(metricTarget)) metricTarget = null;

  // Channels
  const channels = CHANNEL_KEYWORDS.filter((c) => c.pattern.test(text)).map((c) => c.channel);

  // Constraints
  const constraints = CONSTRAINT_PATTERNS.map((p) => text.match(p)?.[0]).filter((s): s is string => !!s);

  // Objective: the sentence/phrase without the extracted specifics.
  cleaned = cleaned
    .replace(/\b(i\s+want\s+to|i\s+need\s+to|help\s+me|i'd like to)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
  const objective = (cleaned || text).slice(0, 300);

  return {
    objective: objective.charAt(0).toUpperCase() + objective.slice(1),
    successMetric: successMetric || "signups",
    metricTarget,
    metricUnit,
    deadline: deadline?.iso ?? null,
    constraints,
    channels,
    cleaned,
  };
}
