/**
 * Product & Audience brief — a unified, evidence-backed view over the product
 * profile, business-context facts and audience insights. Provenance is the
 * spine: every card shows where its claim comes from, and assumptions are
 * flagged for validation instead of quietly reading as fact.
 *
 * Pure functions; the page is a thin renderer.
 */

export type Provenance = "verified" | "user_provided" | "external_observation" | "hypothesis";

const PROVENANCE_RANK: Record<Provenance, number> = {
  verified: 3,
  external_observation: 2,
  user_provided: 1,
  hypothesis: 0,
};

export const PROVENANCE_META: Record<Provenance, { label: string; badge: "forest" | "moss" | "warm" | "clay" }> = {
  verified: { label: "Verified", badge: "forest" },
  external_observation: { label: "Observed", badge: "moss" },
  user_provided: { label: "Founder input", badge: "warm" },
  hypothesis: { label: "Assumption", badge: "clay" },
};

/** Strongest provenance wins; unknown strings degrade to hypothesis. */
export function bestProvenance(list: string[]): Provenance {
  let best: Provenance = "hypothesis";
  for (const raw of list) {
    const p = (Object.prototype.hasOwnProperty.call(PROVENANCE_RANK, raw) ? raw : "hypothesis") as Provenance;
    if (PROVENANCE_RANK[p] > PROVENANCE_RANK[best]) best = p;
  }
  return best;
}

export interface BriefFactLike {
  category: string;
  value: string;
  provenance: string;
  source?: string | null;
}

export interface BriefProfileLike {
  name: string | null;
  description: string | null;
  problem: string | null;
  valueProp: string | null;
  audience: string | null;
  market: string | null;
  positioning: string | null;
  goal: string | null;
}

export interface BriefCard {
  key: string;
  label: string;
  value: string | null;
  provenance: Provenance;
  sources: number;
  editHref: string;
}

function latestValue(list: BriefFactLike[]): string | null {
  return list.length > 0 ? list[list.length - 1].value : null;
}

function joinValues(list: BriefFactLike[], max = 2): string | null {
  if (list.length === 0) return null;
  return list
    .slice(-max)
    .map((f) => f.value)
    .join(" · ");
}

/**
 * The six brief cards. Facts are expected oldest-first (the page orders by
 * updatedAt asc) so "latest" means the last element of each category list.
 * A card backed only by profile-form data carries provenance
 * "user_provided" — the founder typed it, no external source yet.
 */
export function buildBriefCards(profile: BriefProfileLike, facts: BriefFactLike[]): BriefCard[] {
  const of = (...categories: string[]) => facts.filter((f) => categories.includes(f.category));

  const definition = of("product");
  const audience = of("audience");
  const positioning = of("positioning");
  const proof = of("metric", "research");
  const competitors = of("competitor");

  const definitionValue =
    profile.name && profile.description
      ? `${profile.name} — ${profile.description}`
      : profile.description ?? profile.name ?? latestValue(definition);
  const problemValue = profile.problem ?? latestValue(definition);
  const valueValue = profile.valueProp ?? profile.positioning ?? joinValues(positioning);

  const pick = (cardValue: string | null, cardFacts: BriefFactLike[]): { value: string | null; provenance: Provenance; sources: number } => ({
    value: cardValue,
    provenance: cardFacts.length > 0 ? bestProvenance(cardFacts.map((f) => f.provenance)) : cardValue ? "user_provided" : "hypothesis",
    sources: cardFacts.length,
  });

  const cards: BriefCard[] = [
    { key: "definition", label: "Product definition", editHref: "/app/workspace", ...pick(definitionValue, definition) },
    { key: "customer", label: "Ideal customer", editHref: "/app/workspace", ...pick(profile.audience, audience) },
    { key: "problem", label: "Core problem", editHref: "/app/workspace", ...pick(problemValue, definition) },
    { key: "value", label: "Value proposition", editHref: "/app/workspace", ...pick(valueValue, positioning) },
    { key: "proof", label: "Proof points", editHref: "/app/context", ...pick(latestValue(proof), proof) },
    { key: "alternatives", label: "Alternatives", editHref: "/app/context", ...pick(joinValues(competitors), competitors) },
  ];
  return cards;
}

export interface BriefCompleteness {
  filledUnits: number;
  totalUnits: number;
  percent: number;
  assumptionsToValidate: number;
  verifiedCount: number;
}

/**
 * Transparent formula: the 8 profile sections plus one unit for "audience
 * insights exist". Nothing weighted, nothing hidden — the page states it.
 */
export function computeBriefCompleteness(input: {
  profileValues: (string | null | undefined)[];
  audienceInsightCount: number;
  facts: { provenance: string }[];
}): BriefCompleteness {
  const filled = input.profileValues.filter((v) => typeof v === "string" && v.trim().length > 0).length;
  const totalUnits = input.profileValues.length + 1;
  const filledUnits = filled + (input.audienceInsightCount > 0 ? 1 : 0);
  return {
    filledUnits,
    totalUnits,
    percent: totalUnits === 0 ? 0 : Math.round((filledUnits / totalUnits) * 100),
    assumptionsToValidate: input.facts.filter((f) => f.provenance === "hypothesis").length,
    verifiedCount: input.facts.filter((f) => f.provenance === "verified").length,
  };
}

export interface BriefEvidenceRow {
  key: string;
  statement: string;
  type: string;
  source: string;
  confidence: string;
  status: Provenance;
  nextStep: { label: string; href: string } | null;
}

const INSIGHT_SOURCE_META: Record<string, { label: string; status: Provenance }> = {
  assumption: { label: "Stated assumption", status: "hypothesis" },
  interview: { label: "Interview", status: "user_provided" },
  research: { label: "External research", status: "external_observation" },
  observed: { label: "Observed in product", status: "external_observation" },
};

function factNextStep(provenance: Provenance): { label: string; href: string } | null {
  switch (provenance) {
    case "verified":
      return null;
    case "hypothesis":
      return { label: "Validate", href: "/app/experiments" };
    case "user_provided":
      return { label: "Mark verified or add a source", href: "/app/context" };
    case "external_observation":
      return { label: "Review", href: "/app/context" };
  }
}

/** The "Evidence & assumptions" table: facts and audience insights, one vocabulary. */
export function buildEvidenceRows(
  facts: (BriefFactLike & { id: string; confidence?: string | null })[],
  insights: { id: string; title: string; source: string; confidence: string }[],
): BriefEvidenceRow[] {
  const factRows: BriefEvidenceRow[] = facts.map((f) => {
    const status = bestProvenance([f.provenance]);
    return {
      key: `fact-${f.id}`,
      statement: f.value,
      type: `fact · ${f.category}`,
      source: f.source?.trim() ? f.source : PROVENANCE_META[status].label,
      confidence: f.confidence?.trim() ? f.confidence : "—",
      status,
      nextStep: factNextStep(status),
    };
  });
  const insightRows: BriefEvidenceRow[] = insights.map((i) => {
    const meta = INSIGHT_SOURCE_META[i.source] ?? { label: i.source, status: "hypothesis" as Provenance };
    return {
      key: `insight-${i.id}`,
      statement: i.title,
      type: "audience insight",
      source: meta.label,
      confidence: i.confidence,
      status: meta.status,
      nextStep: factNextStep(meta.status),
    };
  });
  return [...factRows, ...insightRows];
}
