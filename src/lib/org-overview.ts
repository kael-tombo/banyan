import { prisma } from "@/lib/db";
import type { AccessibleProduct } from "@/lib/products";

/**
 * BOS-014: the founder command center. Per product the user can reach: what is
 * waiting on them, the active cycle, publications and failures in the period,
 * first-party visits and signups, and credits; plus organization totals.
 * Products the user cannot reach never enter the queries.
 */

export type ProductRow = {
  id: string;
  name: string;
  productType: string;
  status: string;
  waiting: number;
  cycle: { id: string; objective: string; progress: number; deadline: Date | null } | null;
  published: number;
  failures: number;
  /** null = no tracked link in this product (not measured), 0 = measured nothing. */
  visits: number | null;
  signups: number | null;
  credits: number | null;
};

export type Overview = {
  days: number;
  products: ProductRow[];
  totals: { products: number; waiting: number; activeCycles: number; published: number; failures: number; visits: number | null; signups: number | null; credits: number | null };
};

type Counts = Map<string, number>;
const inc = (m: Counts, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

/** Pure assembly, unit-tested: sums only what was measured; null stays null. */
export function assembleOverview(
  days: number,
  products: { id: string; name: string; productType: string; status: string }[],
  data: {
    waiting: Counts;
    cycles: Map<string, ProductRow["cycle"]>;
    published: Counts;
    failures: Counts;
    measured: Set<string>;
    visits: Counts;
    signups: Counts;
    credits: Map<string, number>;
  }
): Overview {
  const rows: ProductRow[] = products.map((p) => ({
    ...p,
    waiting: data.waiting.get(p.id) ?? 0,
    cycle: data.cycles.get(p.id) ?? null,
    published: data.published.get(p.id) ?? 0,
    failures: data.failures.get(p.id) ?? 0,
    visits: data.measured.has(p.id) ? data.visits.get(p.id) ?? 0 : null,
    signups: data.measured.has(p.id) ? data.signups.get(p.id) ?? 0 : null,
    credits: data.credits.has(p.id) ? data.credits.get(p.id)! : null,
  }));
  const sumMeasured = (k: "visits" | "signups" | "credits") => {
    const vals = rows.map((r) => r[k]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  return {
    days,
    products: rows,
    totals: {
      products: rows.length,
      waiting: rows.reduce((a, r) => a + r.waiting, 0),
      activeCycles: rows.filter((r) => r.cycle).length,
      published: rows.reduce((a, r) => a + r.published, 0),
      failures: rows.reduce((a, r) => a + r.failures, 0),
      visits: sumMeasured("visits"),
      signups: sumMeasured("signups"),
      credits: sumMeasured("credits"),
    },
  };
}

export async function loadOverview(products: AccessibleProduct[], days: number): Promise<Overview> {
  const list = products.filter((p) => p.workspace.status !== "archived");
  const ids = list.map((p) => p.workspace.id);
  const since = new Date(Date.now() - days * 86_400_000);
  const empty = () => new Map<string, number>();
  if (!ids.length) {
    return assembleOverview(days, [], { waiting: empty(), cycles: new Map(), published: empty(), failures: empty(), measured: new Set(), visits: empty(), signups: empty(), credits: empty() });
  }
  const scope = { workspaceId: { in: ids } };
  const [drafts, strategies, gates, goals, pubs, links, events, credits] = await Promise.all([
    prisma.contentItem.groupBy({ by: ["workspaceId"], where: { ...scope, status: "ready_for_review" }, _count: { _all: true } }),
    prisma.strategy.groupBy({ by: ["workspaceId"], where: { ...scope, status: "proposed" }, _count: { _all: true } }),
    prisma.agentTask.groupBy({ by: ["workspaceId"], where: { ...scope, status: "waiting_approval" }, _count: { _all: true } }),
    prisma.goal.findMany({ where: { ...scope, status: { in: ["planning", "awaiting_approval", "active"] } }, orderBy: { createdAt: "desc" }, select: { id: true, workspaceId: true, objective: true, progress: true, deadline: true } }),
    prisma.publication.findMany({
      where: { contentItem: scope, OR: [{ status: "published", publishedAt: { gte: since } }, { status: { in: ["failed", "blocked"] }, updatedAt: { gte: since } }] },
      select: { status: true, contentItem: { select: { workspaceId: true } } },
    }),
    prisma.trackedLink.groupBy({ by: ["workspaceId"], where: scope, _count: { _all: true } }),
    prisma.metricEvent.groupBy({ by: ["workspaceId", "type"], where: { ...scope, type: { in: ["visit", "signup"] }, createdAt: { gte: since }, OR: [{ linkId: { not: null } }, { campaignId: { not: null } }] }, _count: { _all: true } }),
    prisma.creditAccount.findMany({ where: scope, select: { workspaceId: true, available: true } }),
  ]);

  const waiting: Counts = new Map();
  for (const r of [...drafts, ...strategies, ...gates]) inc(waiting, r.workspaceId, r._count._all);
  const cycles = new Map<string, ProductRow["cycle"]>();
  for (const g of goals) if (!cycles.has(g.workspaceId)) cycles.set(g.workspaceId, { id: g.id, objective: g.objective, progress: g.progress, deadline: g.deadline });
  const published: Counts = new Map();
  const failures: Counts = new Map();
  for (const p of pubs) inc(p.status === "published" ? published : failures, p.contentItem.workspaceId);
  const measured = new Set(links.filter((l) => l._count._all > 0).map((l) => l.workspaceId));
  const visits: Counts = new Map();
  const signups: Counts = new Map();
  for (const e of events) inc(e.type === "visit" ? visits : signups, e.workspaceId, e._count._all);
  const creditMap = new Map(credits.map((c) => [c.workspaceId, c.available]));

  return assembleOverview(
    days,
    list.map((p) => ({ id: p.workspace.id, name: p.workspace.name, productType: p.workspace.productType, status: p.workspace.status })),
    { waiting, cycles, published, failures, measured, visits, signups, credits: creditMap }
  );
}
