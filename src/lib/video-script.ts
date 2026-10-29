/**
 * Content Studio support — pure functions behind the content editor's
 * script timeline, platform adaptations, and review checklist.
 *
 * Honesty rules:
 *  - The timeline's per-segment seconds are ESTIMATED pacing derived from the
 *    recorded segment structure (hook ~3s, scenes ~6s each, CTA ~3s). The UI
 *    labels them as estimates; production timing is decided when the video is
 *    actually recorded.
 *  - The claim lint is a deterministic phrase lint, not an AI compliance
 *    agent: it flags absolute/unverifiable phrasing for human review. It can
 *    miss things and it can over-flag; its job is to slow the publish down,
 *    not to clear it.
 */

import type { Channel } from "@/lib/formats";

// ---------------------------------------------------------------------------
// Video script timeline
// ---------------------------------------------------------------------------

export type VideoExtrasShape = {
  hook?: string;
  script?: string;
  scenes?: { scene?: string; visual?: string }[];
  onScreenText?: string;
  caption?: string;
  cta?: string;
  adaptations?: Record<string, string>;
};

export type TimelineSegment = {
  key: string;
  label: string;
  startSec: number;
  endSec: number;
  text: string;
  visual: string | null;
  estimated: true;
};

const HOOK_SECONDS = 3;
const SCENE_SECONDS = 6;
const CTA_SECONDS = 3;

/**
 * Build an estimated pacing timeline from the recorded video extras.
 * Returns null when there is no script structure to lay out.
 */
export function buildVideoTimeline(extras: VideoExtrasShape | null | undefined): TimelineSegment[] | null {
  if (!extras) return null;
  const hook = (extras.hook ?? "").trim();
  const scenes = (extras.scenes ?? []).filter((s) => (s.scene ?? "").trim() || (s.visual ?? "").trim());
  const cta = (extras.cta ?? "").trim();
  if (!hook && scenes.length === 0 && !cta) return null;

  const segments: TimelineSegment[] = [];
  let t = 0;
  if (hook) {
    segments.push({ key: "hook", label: "Hook", startSec: t, endSec: t + HOOK_SECONDS, text: hook, visual: null, estimated: true });
    t += HOOK_SECONDS;
  }
  scenes.forEach((s, i) => {
    const text = (s.scene ?? "").trim() || (s.visual ?? "").trim();
    segments.push({
      key: `scene-${i + 1}`,
      label: `Scene ${i + 1}`,
      startSec: t,
      endSec: t + SCENE_SECONDS,
      text,
      visual: (s.visual ?? "").trim() || null,
      estimated: true,
    });
    t += SCENE_SECONDS;
  });
  if (cta) {
    segments.push({ key: "cta", label: "CTA", startSec: t, endSec: t + CTA_SECONDS, text: cta, visual: null, estimated: true });
    t += CTA_SECONDS;
  }
  return segments;
}

/** Total estimated runtime in seconds; null when no timeline exists. */
export function estimatedRuntime(segments: TimelineSegment[] | null): number | null {
  if (!segments || segments.length === 0) return null;
  return segments[segments.length - 1].endSec;
}

// ---------------------------------------------------------------------------
// Platform adaptations — one asset, per-channel copy, honest limits
// ---------------------------------------------------------------------------

export const ADAPTATION_TARGETS: { channel: Channel; label: string; limit: number; requirement: string }[] = [
  { channel: "x", label: "X", limit: 280, requirement: "Single post · hook in the first line · tracked link in post" },
  { channel: "linkedin", label: "LinkedIn", limit: 3000, requirement: "First ~200 chars before “see more” · line breaks survive" },
  { channel: "shortvideo", label: "Short-form video", limit: 6000, requirement: "Script + on-screen text + caption · ≤60s recommended" },
];

export function adaptationLimit(channel: string): number {
  return ADAPTATION_TARGETS.find((t) => t.channel === channel)?.limit ?? 6000;
}

/** Normalize stored adaptations to the three real channels; unknown keys are dropped. */
export function normalizeAdaptations(raw: Record<string, string> | undefined): Record<Channel, string> {
  const out = { x: "", linkedin: "", shortvideo: "" } as Record<Channel, string>;
  if (!raw) return out;
  for (const t of ADAPTATION_TARGETS) {
    const v = raw[t.channel];
    if (typeof v === "string") out[t.channel] = v.trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Claim lint — deterministic flags for human review
// ---------------------------------------------------------------------------

/** Absolute / unverifiable phrasings that deserve a human look before publishing. */
const CLAIM_PATTERNS: { pattern: RegExp; why: string }[] = [
  { pattern: /\bguarantee(d|s)?\b/i, why: "absolute guarantee" },
  { pattern: /\b100%/, why: "absolute percentage" },
  { pattern: /\brisk[- ]free\b/i, why: "absolute risk claim" },
  { pattern: /\bnumber one\b|\b#1\b|\bno\.?\s?1\b/i, why: "unranked superlative" },
  { pattern: /\bworld'?s best\b|\bbest in (the )?world\b/i, why: "unverifiable superlative" },
  { pattern: /\binstant(ly)?\b/i, why: "speed claim" },
  { pattern: /\bovernight\b/i, why: "speed claim" },
  { pattern: /\beveryone\b|\bnobody\b|\ball (users|teams|companies)\b/i, why: "universal claim" },
  { pattern: /\bnever fails?\b|\bzero risk\b/i, why: "absolute claim" },
  { pattern: /\b2\d{2}%|\b10x\b/i, why: "outsized multiplier that needs a source" },
];

export type ClaimFlag = { phrase: string; why: string };

/** Deterministic lint over the item body. Returns [] for clean copy. */
export function claimLint(body: string): ClaimFlag[] {
  const flags: ClaimFlag[] = [];
  for (const { pattern, why } of CLAIM_PATTERNS) {
    const m = body.match(pattern);
    if (m && m[0]) flags.push({ phrase: m[0], why });
  }
  return flags.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Review checklist — derived state, labeled honestly
// ---------------------------------------------------------------------------

export type ReviewCheckState = "ready" | "verify" | "needs_review";
export type ReviewCheck = {
  key: string;
  label: string;
  state: ReviewCheckState;
  detail: string;
};

export type ReviewChecklistInput = {
  status: string;
  genMeta: { provider?: string; model?: string; isFallback?: boolean } | null;
  sourceRef: string | null;
  campaignEvidence: string | null;
  claims: ClaimFlag[];
};

export function reviewChecklist(input: ReviewChecklistInput): { checks: ReviewCheck[]; humanReviewRequired: boolean } {
  const checks: ReviewCheck[] = [];

  // 1. Draft provenance — what produced this copy.
  if (input.genMeta?.provider) {
    checks.push({
      key: "provenance",
      label: "Draft provenance",
      state: input.genMeta.isFallback ? "verify" : "ready",
      detail: input.genMeta.isFallback
        ? "Generated by the dev fallback template, not a live model response — regenerate before review."
        : `Generated by ${input.genMeta.provider}${input.genMeta.model ? ` (${input.genMeta.model})` : ""}. Generation is recorded in the receipts ledger.`,
    });
  } else {
    checks.push({
      key: "provenance",
      label: "Draft provenance",
      state: "verify",
      detail: "Written by hand — no generation record. That is fine; review applies all the same.",
    });
  }

  // 2. Evidence linkage — what the claims can point at.
  const hasEvidence = !!(input.sourceRef || input.campaignEvidence);
  checks.push({
    key: "evidence",
    label: "Evidence linkage",
    state: hasEvidence ? "ready" : "needs_review",
    detail: hasEvidence
      ? `${input.campaignEvidence ? "Campaign evidence" : ""}${input.campaignEvidence && input.sourceRef ? " and " : ""}${input.sourceRef ? "source reference" : ""} recorded for this draft.`
      : "No campaign evidence or source reference linked — public claims have nothing to point at yet.",
  });

  // 3. Claim lint — deterministic, explainable, over-inclusive by design.
  if (input.claims.length > 0) {
    checks.push({
      key: "claims",
      label: "Claim lint",
      state: "needs_review",
      detail: `Flagged ${input.claims.length} phrase(s) for human review: ${input.claims.map((c) => `“${c.phrase}” (${c.why})`).join(", ")}.`,
    });
  } else {
    checks.push({
      key: "claims",
      label: "Claim lint",
      state: "ready",
      detail: "No absolute or unverifiable phrasing detected by the deterministic lint.",
    });
  }

  // 4. Human gate — the recorded approval state.
  const approved = input.status === "approved" || input.status === "scheduled" || input.status === "published";
  checks.push({
    key: "gate",
    label: "Human approval",
    state: approved ? "ready" : input.status === "rejected" ? "needs_review" : "verify",
    detail: approved
      ? "A human approval is recorded server-side with the approver's identity."
      : input.status === "rejected"
        ? "A reviewer rejected this draft — see the recorded reason before resubmitting."
        : "No human approval recorded yet. Publishing stays blocked until it exists.",
  });

  return {
    checks,
    humanReviewRequired: checks.some((c) => c.state !== "ready"),
  };
}
