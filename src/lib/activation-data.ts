import { prisma } from "@/lib/db";
import { scoreWorkspace, type MilestoneKey, type WorkspaceActivation } from "@/lib/activation";

/**
 * Loads each workspace's earliest milestone timestamps from the rows that
 * record them (US-057). One grouped query per milestone, not per workspace.
 *
 * Known approximation: ProductProfile.approvedAt holds the latest approval, so
 * a re-approved profile shows a later date than the first approval. That can
 * only overstate time-to-value, never understate it.
 */
export async function loadActivation(now = new Date()): Promise<WorkspaceActivation[]> {
  const [workspaces, analyses, profiles, strategies, assets, publications, visits, signups, finals] = await Promise.all([
    prisma.workspace.findMany({ select: { id: true, name: true, isSelf: true, createdAt: true } }),
    prisma.productAnalysis.groupBy({ by: ["workspaceId"], _min: { createdAt: true } }),
    prisma.productProfile.findMany({ where: { approvedAt: { not: null } }, select: { workspaceId: true, approvedAt: true } }),
    prisma.strategy.groupBy({ by: ["workspaceId"], where: { approvedAt: { not: null } }, _min: { approvedAt: true } }),
    prisma.contentItem.groupBy({ by: ["workspaceId"], where: { approvedAt: { not: null } }, _min: { approvedAt: true } }),
    prisma.publication.findMany({
      where: { status: "published", publishedAt: { not: null } },
      select: { publishedAt: true, manual: true, contentItem: { select: { workspaceId: true } } },
    }),
    prisma.metricEvent.groupBy({ by: ["workspaceId"], where: { type: "visit", linkId: { not: null } }, _min: { createdAt: true } }),
    prisma.metricEvent.groupBy({
      by: ["workspaceId"],
      where: { type: "signup", OR: [{ linkId: { not: null } }, { campaignId: { not: null } }] },
      _min: { createdAt: true },
    }),
    prisma.goal.groupBy({ by: ["workspaceId"], where: { deadline: { lte: now }, campaigns: { some: {} } }, _min: { deadline: true } }),
  ]);

  const byWs = <T extends { workspaceId: string }>(rows: T[], pick: (r: T) => Date | null | undefined) =>
    new Map(rows.map((r) => [r.workspaceId, pick(r) ?? null]));
  const analysisAt = byWs(analyses, (r) => r._min.createdAt);
  const profileAt = byWs(profiles, (r) => r.approvedAt);
  const strategyAt = byWs(strategies, (r) => r._min.approvedAt);
  const assetAt = byWs(assets, (r) => r._min.approvedAt);
  const visitAt = byWs(visits, (r) => r._min.createdAt);
  const signupAt = byWs(signups, (r) => r._min.createdAt);
  const finalAt = byWs(finals, (r) => r._min.deadline);

  const firstPub = new Map<string, Date>();
  const firstProviderPub = new Map<string, Date>();
  const providerCount = new Map<string, number>();
  const earliest = (m: Map<string, Date>, k: string, d: Date) => {
    const cur = m.get(k);
    if (!cur || d < cur) m.set(k, d);
  };
  for (const p of publications) {
    const w = p.contentItem.workspaceId;
    const d = p.publishedAt as Date;
    earliest(firstPub, w, d);
    if (!p.manual) {
      earliest(firstProviderPub, w, d);
      providerCount.set(w, (providerCount.get(w) ?? 0) + 1);
    }
  }

  return workspaces.map((w) => {
    const at: Partial<Record<MilestoneKey, Date | null>> = {
      workspace_created: w.createdAt,
      url_submitted: analysisAt.get(w.id) ?? null,
      profile_approved: profileAt.get(w.id) ?? null,
      strategy_approved: strategyAt.get(w.id) ?? null,
      first_asset_approved: assetAt.get(w.id) ?? null,
      first_publication: firstPub.get(w.id) ?? null,
      first_provider_publication: firstProviderPub.get(w.id) ?? null,
      first_tracked_visit: visitAt.get(w.id) ?? null,
      first_attributed_signup: signupAt.get(w.id) ?? null,
      first_final_cycle: finalAt.get(w.id) ?? null,
    };
    return scoreWorkspace({ workspaceId: w.id, name: w.name, isSelf: w.isSelf, at, providerPublications: providerCount.get(w.id) ?? 0 }, now);
  });
}
