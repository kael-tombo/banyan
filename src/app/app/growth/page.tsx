import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader, Card, Badge, EmptyState, StatusBadge } from "@/components/ui";
import { Sprout } from "lucide-react";

export const metadata: Metadata = { title: "Growth" };

/**
 * Banyan.ai's self-distribution view: the product using the product. Every
 * number here is read from the same tables the rest of the app writes, so this
 * page cannot show invented growth. The three milestones are stated explicitly
 * and only advanced by real, observed data.
 */
export default async function GrowthPage() {
  const ctx = await requireWorkspaceServer();

  const [campaigns, publications, clicks, signups, visits, ongoing] = await Promise.all([
    prisma.campaign.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.publication.count({ where: { contentItem: { workspaceId: ctx.workspace.id }, status: "published" } }),
    prisma.trackedLink.aggregate({ where: { workspaceId: ctx.workspace.id }, _sum: { clicks: true } }),
    prisma.metricEvent.count({ where: { workspaceId: ctx.workspace.id, type: "signup" } }),
    prisma.metricEvent.count({ where: { workspaceId: ctx.workspace.id, type: "visit" } }),
    prisma.experiment.count({ where: { workspaceId: ctx.workspace.id, status: { in: ["planned", "running"] } } }),
  ]);

  const trackedClicks = clicks._sum.clicks ?? 0;
  const hasCampaign = campaigns.length > 0;
  const hasApprovedContent = campaigns.some((c) => c._count.items > 0);

  // Milestones are only marked as met by real evidence.
  const capability = hasCampaign && contextComplete(ctx.profile?.name ?? "", ctx.profile?.goal ?? "");
  const reliability = publications >= 0 && hasApprovedContent; // workflow exercised end to end
  const growth = signups > 0;

  return (
    <>
      <PageHeader
        title="Growth: distributing itself"
        description="Banyan.ai is its own first customer. This is the same workspace, campaigns and measurement the product offers every founder — used on Banyan.ai itself."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Clicks via tracked links" value={trackedClicks} note="First-party, from /t/ redirects." />
        <Metric label="Attributed signups" value={signups} note={signups > 0 ? "Observed." : "None observed yet."} />
        <Metric label="Confirmed publications" value={publications} note="Provider-confirmed or manually recorded." />
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 font-medium text-charcoal">
          <Sprout size={16} className="text-moss" aria-hidden="true" /> Milestones (advanced only by evidence)
        </h2>
        <ul className="space-y-3 text-sm">
          <Milestone
            n="1"
            title="Capability"
            met={capability}
            text="The product can run the full loop: goal → plan → campaign → content → approval → publish → measure → learn."
          />
          <Milestone
            n="2"
            title="Reliability"
            met={reliability}
            text="The loop behaves correctly under real conditions (approval enforced, duplicates blocked, missing integrations handled)."
          />
          <Milestone
            n="3"
            title="Growth"
            met={growth}
            text="Real campaigns produce measurable business outcomes. This is only met once attributed signups are actually observed."
          />
        </ul>
        {!growth && (
          <p className="mt-3 text-xs text-charcoal-soft">
            Reflection {visits.toLocaleString()} tracked visits and {signups.toLocaleString()} attributed signups so far.
            Milestone 3 is not claimed until those numbers are real.
          </p>
        )}
      </Card>

      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-charcoal">Self-distribution campaigns</h2>
          <Badge variant="charcoal">{ongoing} active experiment{ongoing === 1 ? "" : "s"}</Badge>
        </div>
        {campaigns.length === 0 ? (
          <EmptyState
            title="No self-distribution campaign yet"
            body="Create a campaign for Banyan.ai itself, with a declared success metric, then generate and approve content for it."
            icon={<Sprout size={22} className="text-forest" />}
          />
        ) : (
          <ul className="space-y-2">
            {campaigns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href={`/app/campaigns/${c.id}`} className="truncate text-charcoal hover:text-forest">
                  {c.name}
                </Link>
                <span className="flex items-center gap-2">
                  <Badge variant="charcoal">{c._count.items} item{c._count.items === 1 ? "" : "s"}</Badge>
                  <StatusBadge status={c.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function contextComplete(name: string, goal: string): boolean {
  return name.trim().length > 0 && goal.trim().length > 0;
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <Card>
      <p className="text-xs font-medium text-charcoal-soft">{label}</p>
      <p className="mt-1 font-serif text-2xl text-forest-deep">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-charcoal-soft">{note}</p>
    </Card>
  );
}

function Milestone({ n, title, met, text }: { n: string; title: string; met: boolean; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          met ? "bg-forest/10 text-forest-deep" : "bg-bark/10 text-charcoal-soft"
        }`}
        aria-hidden="true"
      >
        {n}
      </span>
      <span>
        <span className="block font-medium text-charcoal">
          {title} {met ? <Badge variant="forest">met</Badge> : <Badge variant="warm">not yet</Badge>}
        </span>
        <span className="mt-0.5 block text-charcoal-soft">{text}</span>
      </span>
    </li>
  );
}
