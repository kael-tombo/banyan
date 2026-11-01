import { prisma } from "@/lib/db";

/**
 * What a claim in a draft may rest on (US-054): the founder's product profile,
 * their recorded facts (a hypothesis does not count), the campaign's
 * evidence, and the draft's own source reference. Nothing the model wrote
 * can support a claim, so generated campaign copy (key message) is excluded.
 */
export type EvidenceFor = (campaignId: string | null, sourceRef?: string | null) => string[];

function jsonList(raw: string | null | undefined): string[] {
  try {
    const v: unknown = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function loadClaimEvidence(workspaceId: string): Promise<EvidenceFor> {
  const [profile, facts, campaigns] = await Promise.all([
    prisma.productProfile.findUnique({ where: { workspaceId } }),
    prisma.profileFact.findMany({ where: { workspaceId, provenance: { not: "hypothesis" } }, select: { value: true } }),
    prisma.campaign.findMany({ where: { workspaceId }, select: { id: true, evidence: true } }),
  ]);
  const base = [
    profile?.description,
    profile?.problem,
    profile?.valueProp,
    profile?.positioning,
    profile?.audienceOutcome,
    ...jsonList(profile?.features),
    ...jsonList(profile?.problemsSolved),
    ...jsonList(profile?.differentiators),
    ...facts.map((f) => f.value),
  ].filter((s): s is string => Boolean(s && s.trim()));
  const byCampaign = new Map(campaigns.map((c) => [c.id, c.evidence]));
  return (campaignId, sourceRef) =>
    [...base, campaignId ? byCampaign.get(campaignId) ?? "" : "", sourceRef ?? ""].filter((s) => s.trim());
}
