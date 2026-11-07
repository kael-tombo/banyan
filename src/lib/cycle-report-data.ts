import { prisma } from "@/lib/db";
import { isManualChannel } from "@/lib/formats";
import { buildCycleReport, type CycleReport } from "@/lib/cycle-report";

/** Loads one cycle's rows and builds its report (shared by the report page and the next-move route). */

function parseEvidence(raw: string | null | undefined): { source?: string; ref?: string; summary?: string }[] {
  try {
    const v: unknown = JSON.parse(raw || "[]");
    return Array.isArray(v) ? (v as { source?: string; ref?: string; summary?: string }[]) : [];
  } catch {
    return [];
  }
}

export type LoadedCycle = {
  goal: { id: string; objective: string; createdAt: Date; deadline: Date | null };
  campaignIds: string[];
  strategyBacked: boolean;
  recommendation: { id: string; title: string; status: string } | null;
  report: CycleReport;
};

export async function loadCycleReport(workspaceId: string, goalId: string): Promise<LoadedCycle | null> {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, workspaceId },
    include: {
      campaigns: {
        orderBy: { createdAt: "asc" },
        include: {
          items: {
            orderBy: { createdAt: "asc" },
            include: { approvedBy: { select: { name: true } }, publications: { orderBy: { createdAt: "desc" } } },
          },
        },
      },
      recommendations: { where: { status: { in: ["open", "accepted", "acted_upon"] } }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!goal) return null;

  const campaignIds = goal.campaigns.map((c) => c.id);
  const items = goal.campaigns.flatMap((c) => c.items);
  const [links, metrics] = campaignIds.length
    ? await Promise.all([
        prisma.trackedLink.findMany({ where: { workspaceId, campaignId: { in: campaignIds } }, select: { id: true, slug: true, contentItemId: true, clicks: true } }),
        prisma.campaignMetric.findMany({ where: { workspaceId, campaignId: { in: campaignIds } }, select: { metric: true, value: true, source: true, recordedAt: true } }),
      ])
    : [[], []];
  const signupRows = links.length
    ? await prisma.metricEvent.groupBy({ by: ["linkId"], where: { workspaceId, type: "signup", linkId: { in: links.map((l) => l.id) } }, _count: { _all: true } })
    : [];
  const linkSignups = Object.fromEntries(signupRows.filter((r) => r.linkId).map((r) => [r.linkId as string, r._count._all]));

  const rec = goal.recommendations[0] ?? null;
  const report = buildCycleReport({
    now: new Date(),
    goal: { objective: goal.objective, successMetric: goal.successMetric, metricTarget: goal.metricTarget, metricUnit: goal.metricUnit, deadline: goal.deadline, createdAt: goal.createdAt },
    items: items.map((i) => ({ id: i.id, channel: i.channel, format: i.format, title: i.title, status: i.status, approvedAt: i.approvedAt, approvedBy: i.approvedBy?.name ?? null })),
    publications: items.flatMap((i) => i.publications.map((p) => ({ contentItemId: i.id, status: p.status, manual: p.manual, externalUrl: p.externalUrl, publishedAt: p.publishedAt }))),
    links,
    linkSignups,
    metrics,
    recommendation: rec ? { title: rec.title, rationale: rec.rationale, confidence: rec.confidence, uncertainty: rec.uncertainty, evidence: parseEvidence(rec.evidence) } : null,
    isManualChannel,
  });

  return {
    goal: { id: goal.id, objective: goal.objective, createdAt: goal.createdAt, deadline: goal.deadline },
    campaignIds,
    strategyBacked: goal.campaigns.some((c) => Boolean(c.strategyId)),
    recommendation: rec ? { id: rec.id, title: rec.title, status: rec.status } : null,
    report,
  };
}
