import { CHANNELS, type Channel } from "@/lib/formats";
import type { ProfileFact } from "./generate";

/**
 * Number the approved profile into citable facts (F1, F2, ...). The ids are
 * stable for a given profile version, so a stored strategy's citations can
 * be resolved back to the text they point at.
 */

type ProfileLike = {
  name: string;
  description: string;
  valueProp: string;
  problem: string;
  audience?: string | null;
  audiencePain?: string | null;
  audienceOutcome?: string | null;
  market?: string | null;
  positioning?: string | null;
  features?: string | null;
  problemsSolved?: string | null;
  differentiators?: string | null;
};

const list = (raw: string | null | undefined): string[] => {
  try {
    const v: unknown = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  } catch {
    return [];
  }
};

export function profileFacts(p: ProfileLike): ProfileFact[] {
  const entries: [string, string | null | undefined][] = [
    ["Product", p.name && p.description ? `${p.name}: ${p.description}` : p.name || p.description],
    ["Value proposition", p.valueProp],
    ["Problem", p.problem],
    ["Audience", p.audience],
    ["Audience pain", p.audiencePain],
    ["Audience outcome", p.audienceOutcome],
    ["Market", p.market],
    ["Positioning", p.positioning],
    ...list(p.features).map((f): [string, string] => ["Feature", f]),
    ...list(p.problemsSolved).map((f): [string, string] => ["Problem solved", f]),
    ...list(p.differentiators).map((f): [string, string] => ["Differentiator", f]),
  ];
  return entries
    .filter(([, text]) => typeof text === "string" && text.trim().length > 0)
    .slice(0, 30)
    .map(([label, text], i) => ({ id: `F${i + 1}`, label, text: (text as string).trim().slice(0, 400) }));
}

export function preferredChannels(raw: string | null | undefined): Channel[] {
  return list(raw).filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c));
}

/** Objective sentence from the profile's distribution goal. */
export function objectiveFromProfile(p: { goal?: string | null; goalTarget?: number | null; goalMetric?: string | null }): string {
  const goal = (p.goal ?? "").replace(/_/g, " ").trim();
  if (!goal) return "";
  const target = p.goalTarget ? ` (target: ${p.goalTarget}${p.goalMetric ? ` ${p.goalMetric}` : ""})` : "";
  return `Distribution goal: ${goal}${target}`;
}
