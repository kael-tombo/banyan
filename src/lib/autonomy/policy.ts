import { z } from "zod";
import type { DraftFlag } from "@/lib/content/checks";

/**
 * Supervised autonomy — STRATEGY.md §8/§12, Level 2.
 *
 * The founder writes a policy: which channels may run, how many posts per day,
 * quiet hours, blackout dates, and whether approved posts are also scheduled.
 * Inside it, Banyan approves routine drafts and schedules them; anything
 * outside it escalates to the founder with the reason. Pure and unit-tested.
 *
 * Non-negotiable, whatever the policy says:
 *   - only the founder changes the policy (the system never widens its own mandate);
 *   - a draft with an unsupported claim, a banned term or an over-limit body escalates;
 *   - a template-fallback draft escalates (no model wrote it);
 *   - the first post on a channel escalates;
 *   - a draft touching a topic the founder listed escalates;
 *   - a channel whose last post failed escalates until one goes out;
 *   - more than VOLUME_FACTOR days' worth of auto-approvals in 24 hours escalates;
 *   - short-form video is always published by the founder;
 *   - paused agents do nothing.
 */

export const AUTONOMY_CHANNELS = ["linkedin", "x"] as const;
export type AutonomyChannel = (typeof AUTONOMY_CHANNELS)[number];

export const policyInput = z.object({
  level: z.enum(["approve_each", "supervised"]),
  channels: z.array(z.enum(AUTONOMY_CHANNELS)).max(2),
  maxPerDay: z.number().int().min(1).max(5),
  quietHours: z
    .object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) })
    .refine((q) => q.start !== q.end, "Quiet hours need different start and end hours.")
    .nullable(),
  blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60),
  autoPublish: z.boolean(),
  /** Topics that always come back to the founder (pricing, security, a customer's name…). */
  escalateTopics: z.array(z.string().trim().min(2).max(40)).max(20).default([]),
  /**
   * Continuous cycles (R5, Level 3, off by default): when a cycle ends with a confident recommendation, Banyan
   * starts the next one itself, with this credit budget, at most maxUnattended times in a row before a person
   * starts one. Needs a supervised policy. Null means cycles start only when a person accepts a recommendation.
   */
  continuous: z
    .object({ cycleBudget: z.number().int().min(1).max(500), maxUnattended: z.number().int().min(1).max(6) })
    .nullable()
    .default(null),
});
export type PolicyInput = z.infer<typeof policyInput>;
/** What a caller may send: optional fields (continuous, escalateTopics) take their defaults. */
export type PolicyInputRaw = z.input<typeof policyInput>;

export type AutonomyPolicy = PolicyInput & { version: number; setById: string | null; setAt: string | null };

export const DEFAULT_POLICY: AutonomyPolicy = {
  version: 0,
  level: "approve_each",
  channels: [],
  maxPerDay: 1,
  quietHours: { start: 21, end: 8 },
  blackoutDates: [],
  autoPublish: false,
  escalateTopics: [],
  continuous: null,
  setById: null,
  setAt: null,
};

/**
 * Unusual volume: more auto-approvals on one channel in 24 hours than this
 * many days of the policy's daily cap. Approving is cheap; a burst usually
 * means something upstream went wrong, so the founder sees it.
 */
export const VOLUME_FACTOR = 3;

/** Minimum gap between two autonomous posts on the same channel. */
export const MIN_GAP_HOURS = 3;

export function parsePolicy(raw: string | null | undefined): AutonomyPolicy {
  try {
    const v = JSON.parse(raw || "{}") as Partial<AutonomyPolicy>;
    const input = policyInput.safeParse({ ...DEFAULT_POLICY, ...v });
    if (!input.success) return DEFAULT_POLICY;
    return {
      ...input.data,
      version: typeof v.version === "number" ? v.version : 0,
      setById: typeof v.setById === "string" ? v.setById : null,
      setAt: typeof v.setAt === "string" ? v.setAt : null,
    };
  } catch {
    return DEFAULT_POLICY;
  }
}

/** True when the policy lets Banyan act without asking for at least one channel. */
export function isSupervised(p: AutonomyPolicy): boolean {
  return p.level === "supervised" && p.channels.length > 0 && Boolean(p.setById);
}

const CHANNEL_LABEL: Record<string, string> = { linkedin: "LinkedIn", x: "X", shortvideo: "Short-form video" };
const label = (c: string) => CHANNEL_LABEL[c] ?? c;

export type ApprovalCandidate = {
  channel: string;
  status: string;
  flags: DraftFlag[];
  isFallback: boolean;
  /** Whether this workspace has ever published on the channel through a provider. */
  channelHasPublished: boolean;
  /** Title and body, matched against the founder's escalation topics. */
  text?: string;
  /** The channel's most recent provider publish attempt failed. */
  lastPublishFailed?: boolean;
  /** Drafts the policy already approved on this channel in the last 24 hours. */
  autoApprovedLast24h?: number;
};

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The founder's topics this text mentions, matched as whole words, ignoring case. */
export function matchTopics(text: string, topics: string[]): string[] {
  return topics.filter((t) => {
    const term = t.trim();
    if (!term) return false;
    return new RegExp(String.raw`(^|[^\p{L}\p{N}])` + escapeRe(term) + String.raw`($|[^\p{L}\p{N}])`, "iu").test(text);
  });
}

export type ApprovalDecision = { auto: boolean; reasons: string[] };

export function decideApproval(c: ApprovalCandidate, p: AutonomyPolicy): ApprovalDecision {
  const reasons: string[] = [];
  if (!isSupervised(p)) return { auto: false, reasons: ["Supervised autonomy is off, so every draft waits for your approval."] };
  if (c.status !== "ready_for_review") return { auto: false, reasons: [`The draft is ${c.status.replace(/_/g, " ")}, not waiting for review.`] };
  if (c.channel === "shortvideo") reasons.push("Short-form video is always published by you.");
  else if (!(p.channels as string[]).includes(c.channel)) reasons.push(`${label(c.channel)} is not one of your autopilot channels.`);
  if (c.flags.some((f) => f.code === "unsupported_claim")) reasons.push("It makes a claim nothing in your evidence backs.");
  if (c.flags.some((f) => f.code === "banned_term")) reasons.push("It uses a term your brand voice says to avoid.");
  if (c.flags.some((f) => f.code === "over_limit")) reasons.push("It is longer than the channel allows.");
  if (c.flags.some((f) => f.code === "critic" && f.kind === "unchecked")) reasons.push("The critic could not review it.");
  else if (c.flags.some((f) => f.code === "critic")) reasons.push("The critic flagged something in it.");
  if (c.isFallback) reasons.push("The template fallback wrote it, not the model; it needs your eye.");
  if (!c.channelHasPublished && c.channel !== "shortvideo") reasons.push(`It would be your first post on ${label(c.channel)}; the first one is always yours to approve.`);
  const topics = matchTopics(c.text ?? "", p.escalateTopics ?? []);
  if (topics.length) reasons.push(`It mentions ${topics.map((t) => `“${t}”`).join(", ")}, a topic you asked to see yourself.`);
  if (c.lastPublishFailed) reasons.push(`Your last ${label(c.channel)} post failed to publish; Banyan waits for you until one goes out.`);
  if ((c.autoApprovedLast24h ?? 0) >= p.maxPerDay * VOLUME_FACTOR) {
    reasons.push(`Banyan already approved ${c.autoApprovedLast24h} ${label(c.channel)} drafts in the last 24 hours, which is unusual for your policy; this one waits for you.`);
  }
  if (reasons.length) return { auto: false, reasons };
  return { auto: true, reasons: [`Within your policy v${p.version}: ${label(c.channel)} is an autopilot channel and every pre-review check passed.`] };
}

// ── scheduling ──

function localParts(d: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function inQuiet(hour: number, q: AutonomyPolicy["quietHours"]): boolean {
  if (!q) return false;
  return q.start < q.end ? hour >= q.start && hour < q.end : hour >= q.start || hour < q.end;
}

const STEP = 15 * 60_000;

/**
 * The earliest time, at least 15 minutes from now, when a post on this channel
 * fits the policy: outside quiet hours, not on a blackout date, under the
 * daily cap and at least MIN_GAP_HOURS from the channel's other posts.
 * Null when nothing fits within 14 days.
 */
export function nextSlot(now: Date, p: AutonomyPolicy, timeZone: string, channelTimes: Date[]): Date | null {
  const tz = validTimeZone(timeZone) ? timeZone : "UTC";
  let t = Math.ceil((now.getTime() + STEP) / STEP) * STEP;
  const limit = now.getTime() + 14 * 24 * 3_600_000;
  const byDate = new Map<string, number>();
  for (const d of channelTimes) {
    const k = localParts(d, tz).date;
    byDate.set(k, (byDate.get(k) ?? 0) + 1);
  }
  for (; t <= limit; t += STEP) {
    const at = new Date(t);
    const { date, hour } = localParts(at, tz);
    if (p.blackoutDates.includes(date)) continue;
    if (inQuiet(hour, p.quietHours)) continue;
    if ((byDate.get(date) ?? 0) >= p.maxPerDay) continue;
    if (channelTimes.some((d) => Math.abs(d.getTime() - t) < MIN_GAP_HOURS * 3_600_000)) continue;
    return at;
  }
  return null;
}

// ── digest ──

export type AutonomyEvent = {
  createdAt: Date;
  decision: "auto_approved" | "escalated" | "scheduled" | "not_scheduled";
  channel: string;
  title: string;
  reasons: string[];
  scheduledFor?: string | null;
  /** This auto-approval was picked for the founder's spot check. */
  spotCheck?: boolean;
};

export type Digest = {
  since: Date;
  autoApproved: number;
  escalated: number;
  scheduled: number;
  notScheduled: number;
  topEscalations: { reason: string; count: number }[];
  byChannel: { channel: string; autoApproved: number; escalated: number }[];
};

export function buildDigest(events: AutonomyEvent[], since: Date): Digest {
  const recent = events.filter((e) => e.createdAt >= since);
  const count = (d: AutonomyEvent["decision"]) => recent.filter((e) => e.decision === d).length;
  const reasons = new Map<string, number>();
  for (const e of recent.filter((e) => e.decision === "escalated")) for (const r of e.reasons) reasons.set(r, (reasons.get(r) ?? 0) + 1);
  const channels = [...new Set(recent.map((e) => e.channel))].sort();
  return {
    since,
    autoApproved: count("auto_approved"),
    escalated: count("escalated"),
    scheduled: count("scheduled"),
    notScheduled: count("not_scheduled"),
    topEscalations: [...reasons.entries()].map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count).slice(0, 5),
    byChannel: channels.map((channel) => ({
      channel,
      autoApproved: recent.filter((e) => e.channel === channel && e.decision === "auto_approved").length,
      escalated: recent.filter((e) => e.channel === channel && e.decision === "escalated").length,
    })),
  };
}

/** Plain-language summary of what a policy allows, for the founder and the audit log. */
export function describePolicy(p: AutonomyPolicy): string {
  if (!isSupervised(p)) return "Approve each: every draft waits for you.";
  const q = p.quietHours ? `, never between ${p.quietHours.start}:00 and ${p.quietHours.end}:00` : "";
  const b = p.blackoutDates.length ? `, not on ${p.blackoutDates.length} blackout date${p.blackoutDates.length === 1 ? "" : "s"}` : "";
  const act = p.autoPublish ? "approve and schedule" : "approve (you still press publish)";
  const t = p.escalateTopics?.length ? ` Drafts about ${p.escalateTopics.join(", ")} always come to you.` : "";
  const c = p.continuous
    ? ` When a cycle ends with a confident recommendation, Banyan starts the next one itself (up to ${p.continuous.maxUnattended} in a row, ${p.continuous.cycleBudget} credits each).`
    : "";
  return `Supervised: Banyan may ${act} routine ${p.channels.map(label).join(" and ")} posts, at most ${p.maxPerDay} per channel per day${q}${b}.${t}${c}`;
}
