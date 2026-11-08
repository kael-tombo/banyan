/**
 * Deterministic draft scoring for the eval (blocker 03). Each check maps to an
 * acceptance line in docs/mvp-blockers/03-no-live-model-provider.md. Judgement
 * calls ("approvable with light edits") are left to a human reading the report
 * and, optionally, to a model judge; nothing here pretends to measure taste.
 */
import type { Channel } from "@/lib/formats";
import { bannedTerms, checkDraft, formatDraft } from "@/lib/content/checks";
import { unsupportedClaims } from "@/lib/content/claims";
import type { EvalProduct } from "./products";

export type DraftResult = {
  channel: Channel;
  format: string;
  body: string;
  isFallback: boolean;
  label: string;
};

export type DraftScore = {
  live: boolean;
  withinLimits: boolean;
  bannedTerms: string[];
  inventedClaims: string[];
  grounded: boolean;
  factHits: string[];
  cleanOutput: boolean;
  problems: string[];
};

const META_LEAK = [
  /^\s*(?:sure|certainly|of course)\b|^\s*here(?:'s| is| are) (?:a|an|the|your) (?:draft|post|thread|script|version|linkedin|x |tweet)/i,
  /^\s*#{1,6}\s/m,
  /\*\*[^*\n]+\*\*/,
  /^\s*(?:post|thread|caption|draft)\s*:/im,
  /\[(?:insert|your|link|name)[^\]]*\]/i,
];

/** Evidence a draft may lean on: everything the founder typed. */
export function evidenceFor(p: EvalProduct): string[] {
  return [p.profile.description, p.profile.valueProp, p.profile.audience, p.campaign.keyMessage, p.campaign.evidence, p.campaign.cta, p.campaign.targetAudience];
}

export function scoreDraft(p: EvalProduct, d: DraftResult): DraftScore {
  const body = formatDraft(d.channel, d.format, d.body);
  const flags = checkDraft({ channel: d.channel, format: d.format, body, banned: bannedTerms(p.brandVoice.avoid) });
  const withinLimits = !flags.some((f) => f.code === "over_limit");
  const banned = flags.filter((f) => f.code === "banned_term").map((f) => (f as { term: string }).term);
  const invented = unsupportedClaims(body, evidenceFor(p)).map((c) => c.phrase);
  const lower = body.toLowerCase();
  const factHits = p.factWords.filter((w) => lower.includes(w.toLowerCase()));
  const namesProduct = lower.includes(p.profile.name.toLowerCase());
  const grounded = factHits.length >= 2 && (namesProduct || d.channel === "shortvideo");
  const cleanOutput = !META_LEAK.some((re) => re.test(d.body));

  const problems: string[] = [];
  if (d.isFallback) problems.push("template fallback, not the live model");
  if (!withinLimits) problems.push(flags.find((f) => f.code === "over_limit")!.message);
  if (banned.length) problems.push(`uses avoided terms: ${banned.join(", ")}`);
  if (invented.length) problems.push(`claims not in the evidence: ${invented.map((c) => `"${c}"`).join(", ")}`);
  if (!grounded) problems.push(`thin on the product's own facts (matched: ${factHits.join(", ") || "none"}${namesProduct ? "" : "; product not named"})`);
  if (!cleanOutput) problems.push("meta-commentary, markdown or a placeholder left in the text");

  return { live: !d.isFallback, withinLimits, bannedTerms: banned, inventedClaims: invented, grounded, factHits, cleanOutput, problems };
}

/** First sentence-ish line of a post, with thread numbering removed. */
export function hookOf(body: string): string {
  const first = body.split(/\n+/).map((l) => l.replace(/^\s*\d+\s*[/.)]\s*/, "").trim()).find(Boolean) ?? "";
  return first.split(/(?<=[.!?])\s/)[0];
}

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3));
}

/** Word-overlap (Jaccard) of two hooks; above 0.5 reads as the same opening. */
export function hookOverlap(a: string, b: string): number {
  const A = words(hookOf(a));
  const B = words(hookOf(b));
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

export const DISTINCT_HOOK_MAX_OVERLAP = 0.5;
