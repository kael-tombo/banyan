import type { ProductAnalysisResult } from "@/lib/product/analyze";

/**
 * Product profile review — US-023 (and US-020's "my edit wins").
 * Pure rules, unit-tested; the routes apply them.
 *
 * - Applying an analysis fills only fields that are empty or that came from a
 *   previous analysis. A field the founder wrote is never overwritten.
 * - A profile that contains analysis-sourced fields needs the founder's
 *   approval before strategy work starts. A profile written entirely by the
 *   founder is their own words and needs no extra approval.
 * - Editing an approved profile starts a new version and clears the approval.
 */

export type FieldSource = "user" | "analysis";
export type Sources = Record<string, FieldSource>;

export type ReviewableProfile = {
  name: string;
  description: string;
  valueProp: string;
  audience: string | null;
  features: string;
  problemsSolved: string;
  differentiators: string;
  missingInformation: string;
  fieldSources: string;
  approvedAt: Date | null;
  version: number;
};

export function parseSources(raw: string | null | undefined): Sources {
  try {
    const v: unknown = JSON.parse(raw || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, s]) => s === "user" || s === "analysis")) as Sources;
  } catch {
    return {};
  }
}

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0) || v === "[]";

/** Profile column → value from the analysis. */
function fromAnalysis(a: ProductAnalysisResult): Record<string, string> {
  return {
    name: a.product_name,
    description: a.description,
    valueProp: a.value_proposition,
    audience: a.target_audience.join("; "),
    features: JSON.stringify(a.features),
    problemsSolved: JSON.stringify(a.problems_solved),
    differentiators: JSON.stringify(a.differentiators),
  };
}

/**
 * The update an analysis may make. Fields the founder wrote are kept; empty
 * analysis values never replace existing text. missingInformation always
 * reflects the latest analysis.
 */
export function mergeAnalysis(
  current: Partial<ReviewableProfile> | null,
  analysis: ProductAnalysisResult,
): { data: Record<string, string>; sources: Sources; filled: string[]; kept: string[] } {
  const sources = parseSources(current?.fieldSources);
  const data: Record<string, string> = {};
  const filled: string[] = [];
  const kept: string[] = [];
  for (const [field, value] of Object.entries(fromAnalysis(analysis))) {
    const existing = (current as Record<string, unknown> | null)?.[field];
    if (sources[field] === "user" && !isEmpty(existing)) {
      kept.push(field);
      continue;
    }
    if (isEmpty(value)) continue;
    data[field] = value;
    sources[field] = "analysis";
    filled.push(field);
  }
  data.missingInformation = JSON.stringify(analysis.missing_information);
  data.fieldSources = JSON.stringify(sources);
  return { data, sources, filled, kept };
}

/** Mark the given fields as written by the founder. */
export function markUserFields(raw: string | null | undefined, fields: string[]): string {
  const sources = parseSources(raw);
  for (const f of fields) sources[f] = "user";
  return JSON.stringify(sources);
}

export type ApprovalState = { approved: boolean; needsApproval: boolean; reason: string };

export function approvalState(p: Pick<ReviewableProfile, "fieldSources" | "approvedAt"> | null): ApprovalState {
  if (!p) return { approved: false, needsApproval: false, reason: "No product profile yet." };
  if (p.approvedAt) return { approved: true, needsApproval: false, reason: "Approved." };
  const fromAnalysisFields = Object.entries(parseSources(p.fieldSources)).filter(([, s]) => s === "analysis").map(([f]) => f);
  return fromAnalysisFields.length
    ? { approved: false, needsApproval: true, reason: `Review and approve your product profile first: ${fromAnalysisFields.join(", ")} came from the website analysis.` }
    : { approved: false, needsApproval: false, reason: "Written by the founder." };
}

/** Fields that changing on an approved profile starts a new version. */
export function editBump(p: Pick<ReviewableProfile, "approvedAt" | "version">): { version?: number; approvedAt?: null; approvedById?: null } {
  return p.approvedAt ? { version: p.version + 1, approvedAt: null, approvedById: null } : {};
}

/** Approval needs at least a name and one sentence of what the product is. */
export function approvalBlockers(p: Pick<ReviewableProfile, "name" | "description">): string[] {
  const out: string[] = [];
  if (!p.name.trim()) out.push("Add the product name.");
  if (p.description.trim().length < 10) out.push("Add a short description of what the product does.");
  return out;
}
