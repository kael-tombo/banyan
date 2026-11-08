/**
 * Fabricated-claims guard — US-054, blocker 07.
 *
 * Deterministic and explainable: finds the claims a model most often invents
 * (metrics, customer counts, social proof, testimonials, rankings and
 * guarantees) and checks each against the founder's own evidence. A claim is
 * *supported* when its figures (or, with no figures, its exact wording) appear
 * in that evidence. Unsupported claims block approval until the founder
 * removes them or vouches for them; it never rewrites copy by itself.
 *
 * Over-inclusive by design: a false flag costs one click, a fabricated figure
 * published under the founder's name costs their credibility.
 */

export type ClaimKind = "metric" | "customer_count" | "social_proof" | "testimonial" | "ranking";

export type Claim = { kind: ClaimKind; phrase: string; why: string; key: string };

const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;

const PATTERNS: { kind: ClaimKind; re: RegExp; why: string }[] = [
  // Wider phrases first: a social-proof sentence or a testimonial is reported whole, not as the figure inside it.
  { kind: "social_proof", re: /\b(?:trusted|used|loved|chosen|relied on|backed)\s+by\b[^.!?\n]{0,60}/giu, why: "social proof" },
  { kind: "social_proof", re: new RegExp(String.raw`\bjoin\s+(?:over\s+|more than\s+)?${NUM}`, "giu"), why: "social proof" },
  { kind: "testimonial", re: /[“"][^"”\n]{12,240}[”"]\s*[—–-]\s*\p{Lu}[\p{L}.' -]{1,40}/gu, why: "a testimonial" },
  { kind: "ranking", re: /(?:^|\s)(?:#1|no\.?\s?1|number one)\b[^.!?\n]{0,40}/giu, why: "a ranking" },
  { kind: "ranking", re: /\b(?:world'?s best|best[- ]in[- ]class|industry[- ]leading|market[- ]leading|the leading)\b[^.!?\n]{0,40}/giu, why: "a ranking" },
  { kind: "ranking", re: /\b(?:guarantee[sd]?|risk[- ]free)\b[^.!?\n]{0,40}/giu, why: "a guarantee" },
  { kind: "metric", re: new RegExp(String.raw`\b${NUM}\s?(?:%|percent\b)`, "giu"), why: "a percentage" },
  { kind: "metric", re: new RegExp(String.raw`\b${NUM}\s?[x×](?=\s|$|[.,!?])(?:\s+(?:faster|more|cheaper|better|less|quicker|higher|lower))?`, "giu"), why: "a multiplier" },
  { kind: "metric", re: new RegExp(String.raw`[$€£]\s?${NUM}\s?(?:k|m|bn|million|billion)?\b`, "giu"), why: "a money figure" },
  {
    kind: "metric",
    re: new RegExp(String.raw`\b${NUM}\s?(?:hours?|hrs?|minutes?|mins?|days?|weeks?)\s+(?:saved|faster|less|back|a week|per week|a month|per month)\b`, "giu"),
    why: "a time saving",
  },
  {
    kind: "metric",
    re: new RegExp(String.raw`\bsav(?:e|es|ed|ing)\s+(?:you\s+|teams\s+|founders\s+)?(?:up to\s+|over\s+)?${NUM}\s?(?:hours?|hrs?|minutes?|mins?|days?|weeks?)\b`, "giu"),
    why: "a time saving",
  },
  {
    kind: "customer_count",
    re: new RegExp(
      String.raw`\b${NUM}\s?(?:k|m)?\+?\s+(?:happy\s+|active\s+|paying\s+)?(?:customers|users|teams|companies|businesses|founders|developers|clients|downloads|installs|subscribers|members|startups)\b`,
      "giu"
    ),
    why: "a customer count",
  },
];

const collapse = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function claimKey(kind: ClaimKind, phrase: string): string {
  return `${kind}:${collapse(phrase)}`;
}

/** Every claim in the text, in order of appearance, without duplicates. */
export function findClaims(body: string): Claim[] {
  const found: { at: number; claim: Claim }[] = [];
  const spans: [number, number][] = [];
  for (const { kind, re, why } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of body.matchAll(re)) {
      const phrase = m[0].trim();
      const at = (m.index ?? 0) + m[0].indexOf(phrase);
      const end = at + phrase.length;
      // A span already claimed by an earlier, more specific pattern is not reported twice.
      if (spans.some(([s, e]) => at < e && end > s)) continue;
      spans.push([at, end]);
      found.push({ at, claim: { kind, phrase, why, key: claimKey(kind, phrase) } });
    }
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => f.claim)
    .filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
}

/** Numeric tokens normalised for comparison: "1,000" → "1000", "40 %" → "40%". */
function figures(text: string): string[] {
  return [...text.matchAll(new RegExp(String.raw`${NUM}\s?(?:%|[x×](?![\p{L}]))?`, "giu"))].map((m) =>
    m[0].replace(/,/g, "").replace(/\s/g, "").replace("×", "x").toLowerCase()
  );
}

/** True when the founder's evidence backs the claim. */
export function isSupported(claim: Claim, evidence: string): boolean {
  const corpus = collapse(evidence);
  if (!corpus) return false;
  // A quote attributed to a person must exist verbatim; matching its figures is not enough.
  if (claim.kind === "testimonial") return corpus.includes(collapse(claim.phrase));
  const nums = figures(claim.phrase);
  if (nums.length > 0) {
    const have = new Set(figures(corpus));
    return nums.every((n) => have.has(n) || have.has(n.replace(/[%x]$/, "")));
  }
  return corpus.includes(collapse(claim.phrase));
}

export function unsupportedClaims(body: string, evidence: string[]): Claim[] {
  const corpus = evidence.filter(Boolean).join("\n");
  return findClaims(body).filter((c) => !isSupported(c, corpus));
}

/** Claims still unresolved after the founder vouched for some by key. */
export function unvouched(claims: Claim[], vouchedKeys: readonly string[]): Claim[] {
  const v = new Set(vouchedKeys);
  return claims.filter((c) => !v.has(c.key));
}
