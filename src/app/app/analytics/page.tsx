import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader, EmptyState, Badge, Card } from "@/components/ui";
import { trackedLinkUrl } from "@/lib/analytics/tracked";
import { LineChart } from "lucide-react";

export const metadata: Metadata = { title: "Analytics" };

const FUNNEL_LABELS: Record<string, string> = {
  visit: "Tracked visits",
  signup: "Signups",
  onboarding_complete: "Onboarding completed",
};

export default async function AnalyticsPage() {
  const ctx = await requireWorkspaceServer();

  const [funnel, links, clickTotal, metrics, publicationCount] = await Promise.all([
    prisma.metricEvent.groupBy({ by: ["type"], where: { workspaceId: ctx.workspace.id }, _count: true }),
    prisma.trackedLink.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { campaign: { select: { name: true } } },
    }),
    prisma.trackedLink.aggregate({ where: { workspaceId: ctx.workspace.id }, _sum: { clicks: true } }),
    prisma.campaignMetric.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { recordedAt: "desc" },
      take: 30,
      include: { campaign: { select: { name: true } } },
    }),
    prisma.publication.count({ where: { contentItem: { workspaceId: ctx.workspace.id }, status: "published" } }),
  ]);

  const funnelCount = (type: string) => funnel.find((f) => f.type === type)?._count ?? 0;
  const clicks = clickTotal._sum.clicks ?? 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="First-party, evidence-backed numbers only. Zero means a real zero; anything not measured is labelled as uncollected rather than shown as 0. Provider engagement metrics are unavailable unless a configured adapter reports them."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">Tracked visits</p>
          <p className="mt-1 font-serif text-2xl text-forest-deep">{funnelCount("visit").toLocaleString()}</p>
          <p className="mt-1 text-xs text-charcoal-soft">Clicks recorded through Banyan tracked links.</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">Signups</p>
          <p className="mt-1 font-serif text-2xl text-forest-deep">{funnelCount("signup").toLocaleString()}</p>
          <p className="mt-1 text-xs text-charcoal-soft">
            {funnelCount("signup") > 0
              ? "Attributed only when the visitor arrived via a tracked link."
              : "No attributed signups recorded yet."}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">Confirmed publications</p>
          <p className="mt-1 font-serif text-2xl text-forest-deep">{publicationCount.toLocaleString()}</p>
          <p className="mt-1 text-xs text-charcoal-soft">Provider-confirmed or manually recorded live posts.</p>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-medium text-charcoal">Funnel (first-party events)</h2>
        <ul className="space-y-1 text-sm">
          {Object.keys(FUNNEL_LABELS).map((type) => (
            <li key={type} className="flex items-center justify-between">
              <span className="text-charcoal-soft">{FUNNEL_LABELS[type]}</span>
              <span className="font-medium text-charcoal">{funnelCount(type).toLocaleString()}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-charcoal-soft">
          Attribution limitation: a signup is attributed to a campaign only when the same browser carried a tracked-link
          cookie. Direct signups, cleared cookies and cross-device journeys are recorded as unattributed.
        </p>
      </Card>

      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-charcoal">Tracked links</h2>
          <span className="text-xs text-charcoal-soft">{clicks.toLocaleString()} total clicks</span>
        </div>
        {links.length === 0 ? (
          <EmptyState
            title="No tracked links yet"
            body="Tracked links are created when you attach one to content or create one directly. Every click is recorded as a first-party visit event."
            icon={<LineChart size={22} className="text-forest" />}
          />
        ) : (
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-charcoal">{trackedLinkUrl(l.slug)}</span>
                  <span className="block truncate text-xs text-charcoal-soft">
                    → {l.targetUrl}
                    {l.campaign ? ` · ${l.campaign.name}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant="charcoal">{l.clicks} clicks</Badge>
                  <span className="whitespace-nowrap text-xs text-charcoal-soft">
                    {l.lastClickAt ? `last ${l.lastClickAt.toLocaleDateString()}` : "no clicks yet"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 font-medium text-charcoal">Recorded metrics</h2>
        {metrics.length === 0 ? (
          <p className="text-sm text-charcoal-soft">
            No metrics recorded. Provider metrics are only stored when an adapter actually reports them; manual entries are
            labelled <Badge variant="warm">manual</Badge>.
          </p>
        ) : (
          <ul className="space-y-2">
            {metrics.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-charcoal">
                  {m.metric} = {m.value}
                  <span className="text-charcoal-soft"> · {m.campaign.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={m.source === "manual" ? "warm" : "forest"}>{m.source}</Badge>
                  <span className="text-xs text-charcoal-soft">{m.recordedAt.toLocaleDateString()}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-6 text-xs text-charcoal-soft">
        Need a link? <Link href="/app/content" className="text-forest">Attach a tracked link</Link> from a content item, or
        create campaigns that carry their own links.
      </p>
    </>
  );
}
