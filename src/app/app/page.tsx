import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, EmptyState, PageHeader, StatusBadge, LinkButton } from "@/components/ui";
import { ArrowRight, CheckCircle2, CalendarClock, Sprout, FlaskConical } from "lucide-react";

const GOAL_LABELS: Record<string, string> = {
  first_users: "Find first users", launch: "Launch a product", audience: "Grow an audience",
  leads: "Generate qualified leads", activation: "Improve activation", conversions: "Increase conversions",
};

export default async function DashboardPage() {
  const ctx = await requireWorkspaceServer();
  const wid = ctx.workspace.id;
  const [profile, campaigns, pendingApprovals, upcoming, recentActivity, runningExperiments, publications, links] =
    await Promise.all([
      prisma.productProfile.findUnique({ where: { workspaceId: wid } }),
      prisma.campaign.findMany({ where: { workspaceId: wid, status: { in: ["draft", "planned", "in_progress"] } }, orderBy: { updatedAt: "desc" }, take: 3 }),
      prisma.contentItem.findMany({ where: { workspaceId: wid, status: "ready_for_review" }, orderBy: { updatedAt: "desc" }, take: 5 }),
      prisma.contentItem.findMany({ where: { workspaceId: wid, status: "scheduled" }, orderBy: { scheduledFor: "asc" }, take: 5 }),
      prisma.activityEvent.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.experiment.findMany({ where: { workspaceId: wid, status: { in: ["planned", "running"] } }, orderBy: { updatedAt: "desc" }, take: 3 }),
      prisma.publication.findMany({ where: { contentItem: { workspaceId: wid }, status: "published" }, orderBy: { publishedAt: "desc" }, take: 5, include: { contentItem: true } }),
      prisma.trackedLink.aggregate({ where: { workspaceId: wid }, _sum: { clicks: true } }),
    ]);

  const trackedClicks = links._sum.clicks ?? 0;

  const recommendations: { label: string; href: string; why: string }[] = [];
  if (!profile?.name) recommendations.push({ label: "Complete your product profile", href: "/app/workspace", why: "The system has nothing to ground generation in yet." });
  if (profile && campaigns.length === 0) recommendations.push({ label: "Create your first campaign", href: "/app/campaigns/new", why: "A campaign gives each piece of content a purpose and a success metric." });
  if (pendingApprovals.length > 0) recommendations.push({ label: `Review ${pendingApprovals.length} item(s) awaiting approval`, href: "/app/approvals", why: "Nothing can publish without your recorded approval." });
  if (profile && (JSON.parse(profile.channels || "[]").includes("x") || JSON.parse(profile.channels || "[]").includes("linkedin")) && !(await prisma.channelConnection.count({ where: { workspaceId: wid } }))) {
    recommendations.push({ label: "Connect a publishing integration", href: "/app/publishing", why: "Approved content stays in draft until a connection exists — or publish manually with a post URL." });
  }
  if (runningExperiments.length === 0) recommendations.push({ label: "Start your first experiment", href: "/app/experiments", why: "Evidence beats opinions: test one variable at a time." });

  return (
    <>
      <PageHeader title="Dashboard" description="Workspace summary. Zero values are true zeros; anything the system has not measured is labeled as missing rather than shown as zero." />

      {/* Workspace summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">Distribution goal</p>
          {profile?.goal ? (
            <>
              <p className="mt-1 font-medium text-charcoal">{GOAL_LABELS[profile.goal] ?? profile.goal}</p>
              {profile.goalTarget !== null && <p className="mt-1 text-sm text-charcoal-soft">Target: {profile.goalTarget.toLocaleString()} {profile.goalMetric}</p>}
            </>
          ) : (
            <p className="mt-1 text-sm text-charcoal-soft">Not set — add one in <Link href="/app/workspace" className="text-forest">Workspace</Link>.</p>
          )}
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">Active campaigns</p>
          {campaigns.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {campaigns.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/app/campaigns/${c.id}`} className="truncate font-medium text-charcoal hover:text-forest">{c.name}</Link>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-charcoal-soft">No active campaign yet.</p>
          )}
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">Tracked clicks (observed)</p>
          {trackedClicks > 0 ? (
            <p className="mt-1 font-medium text-charcoal">{trackedClicks.toLocaleString()} clicks via Banyan links</p>
          ) : (
            <p className="mt-1 text-sm text-charcoal-soft">No tracked clicks recorded yet — create a tracked link when you publish.</p>
          )}
        </Card>
      </div>

      {/* Upcoming + approvals */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium text-charcoal">Upcoming content</h2>
            <CalendarClock size={16} className="text-moss" aria-hidden="true" />
          </div>
          {upcoming.length > 0 ? (
            <ul className="space-y-2">
              {upcoming.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/app/content/${c.id}`} className="truncate text-charcoal hover:text-forest">{c.title}</Link>
                  <span className="whitespace-nowrap text-xs text-charcoal-soft">{c.scheduledFor?.toLocaleString() ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-charcoal-soft">Nothing scheduled. Schedule approved content from the content editor.</p>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium text-charcoal">Awaiting your approval</h2>
            <CheckCircle2 size={16} className="text-clay" aria-hidden="true" />
          </div>
          {pendingApprovals.length > 0 ? (
            <ul className="space-y-2">
              {pendingApprovals.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/app/content/${c.id}`} className="truncate text-charcoal hover:text-forest">{c.title}</Link>
                  <Badge variant="warm">{c.channel}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-charcoal-soft">Queue is empty (true zero — not unavailable data).</p>
          )}
        </Card>
      </div>

      {/* Publications + experiments */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium text-charcoal">Confirmed publications</h2>
          {publications.length > 0 ? (
            <ul className="space-y-2">
              {publications.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/app/content/${p.contentItemId}`} className="truncate text-charcoal hover:text-forest">{p.contentItem.title}</Link>
                  <Badge variant={p.manual ? "warm" : "forest"}>{p.manual ? "manual" : p.provider}{p.manual ? " (user-confirmed)" : ""}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-charcoal-soft">No confirmed publications yet. The system only records publications after provider confirmation or your manual confirmation with a live URL.</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-medium text-charcoal">Current experiments</h2>
          {runningExperiments.length > 0 ? (
            <ul className="space-y-2">
              {runningExperiments.map((e) => (
                <li key={e.id} className="text-sm">
                  <Link href={`/app/experiments?open=${e.id}`} className="font-medium text-charcoal hover:text-forest">{e.title}</Link>
                  <div className="mt-0.5"><StatusBadge status={e.status} /></div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-charcoal-soft">No planned or running experiments.</p>
          )}
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="mt-6">
        <h2 className="mb-3 font-medium text-charcoal">Recent activity</h2>
        {recentActivity.length > 0 ? (
          <ul className="space-y-1.5">
            {recentActivity.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2 text-sm text-charcoal-soft">
                <span className="whitespace-nowrap text-xs text-bark/60">{a.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-charcoal">{a.summary}</span>
                {a.actorType === "ai" && <Badge variant="charcoal" className="ml-auto">ai</Badge>}
                {a.actorType === "system" && <Badge variant="charcoal" className="ml-auto">system</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-charcoal-soft">No activity recorded yet.</p>
        )}
      </Card>

      {/* Recommendations */}
      <div className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 font-medium text-charcoal"><Sprout size={16} className="text-moss" aria-hidden="true" /> Recommended next actions</h2>
        {recommendations.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {recommendations.map((r) => (
              <Link key={r.href} href={r.href} className="card-lift flex items-start gap-3 rounded-lg border border-forest/15 bg-white p-4">
                <ArrowRight className="mt-1 text-forest" size={16} aria-hidden="true" />
                <span>
                  <span className="block text-sm font-medium text-charcoal">{r.label}</span>
                  <span className="mt-0.5 block text-xs text-charcoal-soft">{r.why}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="Everything is in motion" body="No open setup steps remain. Keep campaigns running and experiments measuring." icon={<FlaskConical size={22} className="text-forest" />} />
        )}
      </div>

      {recommendations.length === 0 && <div className="mt-4"><LinkButton href="/app/campaigns/new" variant="secondary">Create a new campaign</LinkButton></div>}
    </>
  );
}
