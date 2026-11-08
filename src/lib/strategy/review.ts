import { CHANNEL_META } from "@/lib/formats";
import { finalizeStrategy, strategyDraftSchema, KPI_LABEL, type StrategyBody, type StrategyInput } from "./generate";

/**
 * Strategy review rules — US-043. Pure and unit-tested.
 *
 * proposed → approved | rejected | superseded
 * approved → superseded (when a newer version is approved)
 *
 * Approval is refused while the strategy is stale (the profile changed
 * since it was generated). Editing never mutates a version: it creates the
 * next one, so what was approved stays exactly as approved.
 */

export type StrategyStatus = "proposed" | "approved" | "rejected" | "superseded";
export type ReviewAction = "approve" | "reject";

/**
 * The version to show: a proposal waiting on the founder first (it needs a
 * decision), then the approved one content is written from, then the newest.
 * Expects versions newest first.
 */
export function pickCurrent<T extends { status: string }>(newestFirst: T[]): T | null {
  return newestFirst.find((s) => s.status === "proposed") ?? newestFirst.find((s) => s.status === "approved") ?? newestFirst[0] ?? null;
}

export function reviewDecision(
  status: string,
  action: ReviewAction,
  opts: { stale?: boolean } = {},
): { ok: true; idempotent?: boolean } | { ok: false; reason: string } {
  if (action === "approve") {
    if (status === "approved") return { ok: true, idempotent: true };
    if (status !== "proposed") return { ok: false, reason: `A ${status} strategy cannot be approved. Generate or edit a new version.` };
    if (opts.stale) return { ok: false, reason: "The product profile changed after this strategy was generated. Regenerate it before approving." };
    return { ok: true };
  }
  if (action === "reject") {
    if (status === "rejected") return { ok: true, idempotent: true };
    if (status !== "proposed") return { ok: false, reason: `Only a proposed strategy can be rejected (this one is ${status}).` };
    return { ok: true };
  }
  return { ok: false, reason: "Unknown action." };
}

/** Validate a founder-edited body with the same rules as model output. */
export function validateEditedBody(raw: unknown, input: StrategyInput): { ok: true; body: StrategyBody } | { ok: false; problems: string[] } {
  const parsed = strategyDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "strategy"}: ${i.message}`) };
  }
  return finalizeStrategy(parsed.data, input);
}

/**
 * What changed between two versions, as plain sentences, so the difference
 * reads without relying on colour.
 */
export function diffStrategies(prev: StrategyBody, next: StrategyBody): string[] {
  const out: string[] = [];
  const label = (c: string) => CHANNEL_META[c as keyof typeof CHANNEL_META]?.label ?? c;
  const pc = prev.channels.map((c) => c.channel);
  const nc = next.channels.map((c) => c.channel);
  for (const c of nc) if (!pc.includes(c)) out.push(`Added ${label(c)}.`);
  for (const c of pc) if (!nc.includes(c)) out.push(`Removed ${label(c)}.`);
  if (pc.filter((c) => nc.includes(c)).join() !== nc.filter((c) => pc.includes(c)).join()) out.push(`Channel order is now ${nc.map(label).join(", ")}.`);
  for (const c of next.channels) {
    const before = prev.channels.find((p) => p.channel === c.channel);
    if (before && before.rationale !== c.rationale) out.push(`${label(c.channel)} rationale rewritten.`);
    if (before && before.formats.join() !== c.formats.join()) out.push(`${label(c.channel)} formats: ${c.formats.join(", ")}.`);
  }
  for (const f of next.frequency) {
    const before = prev.frequency.find((p) => p.channel === f.channel);
    if (before && before.posts_per_week !== f.posts_per_week) out.push(`${label(f.channel)}: ${before.posts_per_week} → ${f.posts_per_week} posts a week.`);
  }
  const pa = prev.messaging_angles.map((a) => a.angle);
  const na = next.messaging_angles.map((a) => a.angle);
  const addedAngles = na.filter((a) => !pa.includes(a)).length;
  const removedAngles = pa.filter((a) => !na.includes(a)).length;
  if (addedAngles || removedAngles) out.push(`Messaging angles: ${addedAngles} new, ${removedAngles} removed.`);
  if (prev.objectives.join("|") !== next.objectives.join("|")) out.push("Objectives changed.");
  for (const k of next.kpis) {
    const before = prev.kpis.find((p) => p.metric === k.metric);
    if (!before) out.push(`Added KPI: ${KPI_LABEL[k.metric]}.`);
    else if (before.target !== k.target) out.push(`${KPI_LABEL[k.metric]} target: ${before.target ?? "none"} → ${k.target ?? "none"}.`);
  }
  for (const k of prev.kpis) if (!next.kpis.some((n) => n.metric === k.metric)) out.push(`Removed KPI: ${KPI_LABEL[k.metric]}.`);
  return out;
}
