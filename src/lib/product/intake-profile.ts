/**
 * The onboarding review: an analysis turned into editable fields, each one
 * labelled with where it came from, plus a cycle objective suggested from
 * the site's own call to action. Pure, so the mapping is unit-tested.
 */

import type { ProductAnalysisResult, SiteSummary } from "@/lib/product/analyze";
import type { ProductSnapshot, ProductStage } from "@/lib/product/intake";

export type IntakeProfile = ProductSnapshot & {
  tagline: string;
  category: string;
  positioning: string;
  pricing: string;
  primaryCta: string;
  tone: string;
  features: string[];
  differentiators: string[];
  problemsSolved: string[];
  proof: string[];
  alternatives: string[];
  /** What the site does not say, in the analysis's words. */
  missing: string[];
  /** Field → the page it was read from, or "inferred". Absent: written by the founder. */
  sources: Record<string, string>;
  site: SiteSummary | null;
  method: "model" | "basic" | "manual" | "saved";
  pages: string[];
};

export const BLANK_INTAKE: IntakeProfile = {
  name: "",
  description: "",
  website: "",
  stage: "launched",
  problem: "",
  valueProp: "",
  audience: "",
  audiencePain: "",
  audienceOutcome: "",
  observedFields: [],
  tagline: "",
  category: "",
  positioning: "",
  pricing: "",
  primaryCta: "",
  tone: "",
  features: [],
  differentiators: [],
  problemsSolved: [],
  proof: [],
  alternatives: [],
  missing: [],
  sources: {},
  site: null,
  method: "manual",
  pages: [],
};

/** Analysis key → intake field. */
const FIELD_OF: Record<string, keyof IntakeProfile> = {
  product_name: "name",
  description: "description",
  value_proposition: "valueProp",
  target_audience: "audience",
  problems_solved: "problem",
  audience_pain: "audiencePain",
  audience_outcome: "audienceOutcome",
  stage: "stage",
  tagline: "tagline",
  category: "category",
  positioning: "positioning",
  pricing: "pricing",
  primary_cta: "primaryCta",
  tone: "tone",
  features: "features",
  differentiators: "differentiators",
  proof: "proof",
  alternatives: "alternatives",
};

const STAGES: ProductStage[] = ["idea", "building", "private_beta", "public_beta", "launched", "growth"];

/** "Back-and-forth email" → "Back-and-forth email." so listed problems read as prose. */
const sentence = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** A provenance value can name several pages ("a + b"); show the first, or "inferred". */
function sourceOf(raw: string | undefined): string {
  if (!raw) return "";
  const url = raw.match(/https?:\/\/[^\s,+|]+/)?.[0];
  if (url) return url;
  return /inferr/i.test(raw) ? "inferred" : "";
}

export function intakeFromAnalysis(
  a: ProductAnalysisResult,
  opts: { url: string; method: "model" | "basic"; pages: string[] },
): IntakeProfile {
  const p: IntakeProfile = {
    ...BLANK_INTAKE,
    name: a.product_name,
    description: a.description,
    website: opts.pages[0] ?? opts.url,
    stage: STAGES.includes(a.stage as ProductStage) ? (a.stage as ProductStage) : "launched",
    problem: a.problems_solved.slice(0, 2).map(sentence).join(" "),
    valueProp: a.value_proposition || a.tagline,
    audience: a.target_audience.slice(0, 3).join("; "),
    audiencePain: a.audience_pain,
    audienceOutcome: a.audience_outcome,
    tagline: a.tagline,
    category: a.category,
    positioning: a.positioning,
    pricing: a.pricing,
    primaryCta: a.primary_cta || a.site?.ctas[0] || "",
    tone: a.tone,
    features: a.features,
    differentiators: a.differentiators,
    problemsSolved: a.problems_solved,
    proof: a.proof,
    alternatives: a.alternatives,
    missing: a.missing_information,
    site: a.site ?? null,
    method: opts.method,
    pages: opts.pages,
  };

  const sources: Record<string, string> = {};
  for (const [key, field] of Object.entries(FIELD_OF)) {
    const value = p[field];
    const filled = Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0;
    if (!filled) continue;
    sources[field] = sourceOf(a.provenance[key]) || (key === "stage" ? "inferred" : opts.pages[0] ?? opts.url);
  }
  // The value proposition fell back to the tagline: same source.
  if (!a.value_proposition && a.tagline && sources.tagline) sources.valueProp = sources.tagline;
  // A stage the site never signalled is a default, not a reading.
  if (!a.stage) delete sources.stage;
  p.sources = sources;
  p.observedFields = Object.keys(sources);
  return p;
}

/** The fields a cycle cannot start without, in the order the review shows them. */
export const REQUIRED_FIELDS: { key: keyof IntakeProfile; label: string; min: number }[] = [
  { key: "name", label: "Product name", min: 1 },
  { key: "description", label: "What it does", min: 10 },
  { key: "audience", label: "Who it's for", min: 2 },
  { key: "problem", label: "The problem it solves", min: 10 },
  { key: "valueProp", label: "Why it's worth it", min: 10 },
];

export function missingRequired(p: IntakeProfile): { key: keyof IntakeProfile; label: string }[] {
  return REQUIRED_FIELDS.filter((f) => String(p[f.key] ?? "").trim().length < f.min).map(({ key, label }) => ({ key, label }));
}

/** How much of the review Banyan filled from the site (for the progress line). */
export function coverage(p: IntakeProfile): { read: number; total: number } {
  const tracked: (keyof IntakeProfile)[] = [
    "name", "description", "audience", "problem", "valueProp", "audiencePain", "audienceOutcome",
    "positioning", "category", "pricing", "features", "differentiators", "proof", "primaryCta", "tone",
  ];
  return { read: tracked.filter((k) => p.sources[k]).length, total: tracked.length };
}

export type CycleSuggestion = { objective: string; metric: string; target: number; days: number; reason: string };

/**
 * A first objective from what the site asks visitors to do. The founder can
 * change all of it; the reason says where it came from.
 */
export function suggestCycle(p: Pick<IntakeProfile, "primaryCta" | "stage">): CycleSuggestion {
  const cta = p.primaryCta.toLowerCase();
  const because = p.primaryCta ? `Your site's main button is “${p.primaryCta}”.` : "";
  const days = 14;
  if (/demo|call|sales|book|meeting|consult|talk to/.test(cta)) {
    return { objective: `Book 5 qualified demos in ${days} days`, metric: "demo bookings", target: 5, days, reason: because };
  }
  if (/wait ?list|early access|request access|notify|join the beta|get invited/.test(cta) || p.stage === "building" || p.stage === "idea") {
    return { objective: `Get 50 waitlist signups in ${days} days`, metric: "waitlist signups", target: 50, days, reason: because || "Your product isn't live yet, so the waitlist is the number to grow." };
  }
  if (/trial/.test(cta)) {
    return { objective: `Get 20 trial signups in ${days} days`, metric: "trial signups", target: 20, days, reason: because };
  }
  if (/download|install|app store|get the app/.test(cta)) {
    return { objective: `Get 50 installs in ${days} days`, metric: "installs", target: 50, days, reason: because };
  }
  if (/buy|purchase|order|shop|pre-?order/.test(cta)) {
    return { objective: `Make 10 sales in ${days} days`, metric: "purchases", target: 10, days, reason: because };
  }
  return { objective: `Get 20 qualified signups in ${days} days`, metric: "signups", target: 20, days, reason: because };
}

type SavedProfile = {
  name: string;
  description: string;
  website: string | null;
  stage: string;
  problem: string;
  valueProp: string;
  audience: string | null;
  audiencePain: string | null;
  audienceOutcome: string | null;
  market?: string | null;
  positioning?: string | null;
  pricing?: string | null;
  features?: string | null;
  differentiators?: string | null;
  problemsSolved?: string | null;
  proofPoints?: string | null;
  brandVoice?: string | null;
};

function jsonList(raw: string | null | undefined): string[] {
  try {
    const v: unknown = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  } catch {
    return [];
  }
}

/** A saved, founder-approved profile as a review: every field is the founder's own. */
export function intakeFromSavedProfile(p: SavedProfile): IntakeProfile {
  let voice: { tone?: unknown; cta?: unknown } = {};
  try {
    voice = JSON.parse(p.brandVoice || "{}") as typeof voice;
  } catch {
    voice = {};
  }
  return {
    ...BLANK_INTAKE,
    name: p.name,
    description: p.description,
    website: p.website ?? "",
    stage: STAGES.includes(p.stage as ProductStage) ? (p.stage as ProductStage) : "launched",
    problem: p.problem,
    valueProp: p.valueProp,
    audience: p.audience ?? "",
    audiencePain: p.audiencePain ?? "",
    audienceOutcome: p.audienceOutcome ?? "",
    category: p.market ?? "",
    positioning: p.positioning ?? "",
    pricing: p.pricing ?? "",
    tone: typeof voice.tone === "string" ? voice.tone : "",
    primaryCta: typeof voice.cta === "string" ? voice.cta : "",
    features: jsonList(p.features),
    differentiators: jsonList(p.differentiators),
    problemsSolved: jsonList(p.problemsSolved),
    proof: jsonList(p.proofPoints),
    method: "saved",
  };
}

/** Trailing punctuation and spaces off, so "…on." + "." never becomes "on..". Letters are kept. */
export function trimEnd(s: string): string {
  return s.trim().replace(/[.!?…\s]+$/u, "");
}
