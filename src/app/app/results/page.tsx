import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, PageHeader, EmptyState } from "@/components/ui";
import { attributionCoverage } from "@/lib/growth-loop";
import {
  computeFunnelStages,
  experimentOutcomeRows,
  channelPerformanceRows,
  dataHealthRows,
  recentDecisionRows,
  type ExperimentSignal,
  type ExperimentConfidence,
  type SignalStrength,
  type DataHealthStatus,
} from "@/lib/results";
import { FlaskConical, LineChart, Activity, ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "Learning & Results" };

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const PERIODS = [7, 30, 90] as const;

const SIGNAL_STYLE: Record<ExperimentSignal, { variant: "forest" | "moss" | "warm" | "clay" | "charcoal"; label: string }> = {
  measured: { variant: "forest", label: "Measured" },
  running: { variant: "moss", label: "Running" },
  planned: { variant: "charcoal", label: "Planned" },
  abandoned: { variant: "warm", label: "Abandoned" },
  no_data: { variant: "warm", label: "No data" },
};

const CONFIDENCE_STYLE: Record<ExperimentConfidence, { variant: "forest" | "warm" | "charcoal"; label: string }> = {
  medium: { variant: "forest", label: "Medium" },
  low: { variant: "warm", label: "Low" },
  unknown: { variant: "charcoal", label: "Unknown" },
};

const STRENGTH_STYLE: Record<SignalStrength, { variant: "forest" | "moss" | "warm" | "charcoal"; label: string }> = {
  strong: { variant: "forest", label: "Strong" },
  moderate: { variant: "moss", label: "Moderate" },
  early: { variant: "warm", label: "Early" },
  none: { variant: "charcoal", label: "None yet" },
};

const HEALTH_STYLE: Record<DataHealthStatus, { dot: string; label: string }> = {
  connected: { dot: "bg-forest", label: "Connected" },
  degraded: { dot: "bg-amber-500", label: "Degraded" },
  not_connected: { dot: "bg-bark/30", label: "Not connected" },
};

function channelLabelOf(channelsJson: string): string | null {
  try {
    const arr = JSON.parse(channelsJson) as unknown;
    if (Array.isArray(arr) && typeof arr[0] === "string") return arr[0];
    return null;
  } catch {
    return null;
  }
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const ctx = await requireWorkspaceServer();
  const wid = ctx.workspace.id;
  const sp = await searchParams;
  const days = PERIODS.includes(Number(sp.days) as (typeof PERIODS)[number]) ? Number(sp.days) : 30;

  const now = new Date();
  const curStart = new Date(now.getTime() - days * DAY);
  const prevStart = new Date(now.getTime() - 2 * days * DAY);

  const [
    curVisits, curSignups, curActivated, curAttributed,
    prevVisits, prevSignups, prevActivated,
    experiments,
    campaigns,
    linkClicksByCampaign,
    signupByCampaign,
    activationByCampaign,
    connections,
    plans,
    recommendations,
    openRecommendations,
  ] = await Promise.all([
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "visit", createdAt: { gte: curStart } } }),
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "signup", createdAt: { gte: curStart } } }),
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "onboarding_complete", createdAt: { gte: curStart } } }),
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "signup", createdAt: { gte: curStart }, OR: [{ linkId: { not: null } }, { campaignId: { not: null } }] } }),
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "visit", createdAt: { gte: prevStart, lt: curStart } } }),
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "signup", createdAt: { gte: prevStart, lt: curStart } } }),
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "onboarding_complete", createdAt: { gte: prevStart, lt: curStart } } }),
    prisma.experiment.findMany({ where: { workspaceId: wid }, orderBy: { updatedAt: "desc" }, take: 12 }),
    prisma.campaign.findMany({ where: { workspaceId: wid, status: { not: "archived" } }, orderBy: { updatedAt: "desc" }, take: 12, select: { id: true, name: true, channels: true } }),
    prisma.trackedLink.groupBy({ by: ["campaignId"], where: { workspaceId: wid, campaignId: { not: null } }, _sum: { clicks: true } }),
    prisma.metricEvent.groupBy({ by: ["campaignId"], where: { workspaceId: wid, type: "signup", createdAt: { gte: curStart }, campaignId: { not: null } }, _count: true }),
    prisma.metricEvent.groupBy({ by: ["campaignId"], where: { workspaceId: wid, type: "onboarding_complete", createdAt: { gte: curStart }, campaignId: { not: null } }, _count: true }),
    prisma.channelConnection.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, select: { label: true, status: true, lastCheckedAt: true } }),
    prisma.goalPlan.findMany({
      where: { goal: { workspaceId: wid }, status: "approved", approvedAt: { not: null } },
      orderBy: { approvedAt: "desc" }, take: 10,
      select: { goalId: true, summary: true, approvedAt: true, goal: { select: { objective: true } } },
    }),
    prisma.recommendation.findMany({
      where: { workspaceId: wid, status: { in: ["accepted", "acted_upon"] } },
      orderBy: { updatedAt: "desc" }, take: 10,
      select: { title: true, rationale: true, status: true, updatedAt: true },
    }),
    prisma.recommendation.findMany({
      where: { workspaceId: wid, status: "open" },
      orderBy: { updatedAt: "desc" }, take: 3,
      select: { id: true, title: true, rationale: true, confidence: true, evidence: true },
    }),
  ]);

  const funnel = computeFunnelStages(
    { visits: curVisits, signups: curSignups, activated: curActivated },
    { visits: prevVisits, signups: prevSignups, activated: prevActivated }
  );

  const outcomes = experimentOutcomeRows(
    experiments.map((e) => ({
      id: e.id, title: e.title, status: e.status, channel: e.channel, successMetric: e.successMetric,
      results: e.results, interpretation: e.interpretation, limitations: e.limitations, nextAction: e.nextAction,
      metricsSnapshot: e.metricsSnapshot, decidedAt: e.decidedAt,
    }))
  );

  const clicksById = new Map(linkClicksByCampaign.filter((r) => r.campaignId).map((r) => [r.campaignId as string, r._sum.clicks ?? 0]));
  const signupsById = new Map(signupByCampaign.map((r) => [r.campaignId as string, r._count]));
  const activationsById = new Map(activationByCampaign.map((r) => [r.campaignId as string, r._count]));
  const performance = channelPerformanceRows(
    campaigns.map((c) => ({
      campaignId: c.id,
      campaignName: c.name,
      channelLabel: channelLabelOf(c.channels),
      clicks: clicksById.get(c.id) ?? 0,
      signups: signupsById.get(c.id) ?? 0,
      activations: activationsById.get(c.id) ?? 0,
    }))
  );
  const maxClicks = Math.max(1, ...performance.map((p) => p.clicks));

  const attributionPct = attributionCoverage(curSignups, curAttributed);
  const unattributed = Math.max(0, curSignups - curAttributed);
  const activationSharePct = curSignups > 0 ? Math.round((curActivated / curSignups) * 100) : null;
  const health = dataHealthRows({
    connections: connections.map((c) => ({ label: c.label, status: c.status, lastCheckedAt: c.lastCheckedAt })),
    attributionPct,
    unattributedSignups: unattributed,
    activationSharePct,
  });

  const decisions = recentDecisionRows({
    plans: plans.map((p) => ({ goalId: p.goalId, goalObjective: p.goal.objective, summary: p.summary, approvedAt: p.approvedAt, approverName: null })),
    experiments: experiments.map((e) => ({ title: e.title, nextAction: e.nextAction, interpretation: e.interpretation, decidedAt: e.decidedAt })),
    recommendations: recommendations.map((r) => ({ title: r.title, rationale: r.rationale, status: r.status, updatedAt: r.updatedAt, confidence: null })),
  });

  return (
    <>
      <PageHeader
        title="Learning & Results"
        description="Understand which growth work is creating qualified customer outcomes. Every number below is first-party and recorded — gaps are labelled as gaps, never smoothed over."
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-bark/15 bg-white p-0.5" role="navigation" aria-label="Time range">
            {PERIODS.map((d) => (
              <Link
                key={d}
                href={`/app/results?days=${d}`}
                aria-current={d === days ? "page" : undefined}
                className={`rounded-[2px] px-2.5 py-1 text-sm ${d === days ? "bg-forest-deep text-ivory font-medium" : "text-charcoal-soft hover:text-forest"}`}
              >
                {d}d
              </Link>
            ))}
          </div>
        }
      />

      {/* ————— Funnel ————— */}
      <div className="grid gap-4 md:grid-cols-3">
        {funnel.map((stage, i) => (
          <Card key={stage.key}>
            <p className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">{stage.label}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="num font-serif text-[28px] leading-none tracking-[-0.01em] text-forest-deep">{stage.count.toLocaleString()}</p>
              {stage.deltaPct !== null && (
                <span className={`text-xs font-medium ${stage.deltaPct >= 0 ? "text-forest" : "text-clay"}`}>
                  {stage.deltaPct >= 0 ? "↑" : "↓"} {Math.abs(stage.deltaPct)}% <span className="font-normal text-charcoal-soft">vs prior {days}d</span>
                </span>
              )}
              {stage.deltaPct === null && <span className="text-xs text-charcoal-soft">no prior-period data</span>}
            </div>
            <p className="mt-1 text-xs text-charcoal-soft">
              {i > 0 && stage.shareOfPrevPct !== null ? `${stage.shareOfPrevPct}% of ${funnel[i - 1].label.toLowerCase()} · ` : ""}
              {stage.description}
            </p>
          </Card>
        ))}
      </div>
      <p className="mt-2 text-xs text-charcoal-soft">
        Conversion rates show observed results for this period. Not all events are attributed — cleared cookies, direct
        visits and cross-device journeys stay unattributed by design.
        {attributionPct !== null && <> Attribution coverage right now: <span className="font-medium text-charcoal">{attributionPct}%</span>.</>}
      </p>

      {/* ————— Experiment outcomes + synthesis ————— */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card className="h-full">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-medium text-charcoal"><FlaskConical size={15} className="text-forest" aria-hidden="true" /> Experiment outcomes</h2>
              <Link href="/app/experiments" className="inline-flex items-center gap-1 text-xs font-medium text-forest hover:underline">
                All experiments <ArrowRight size={11} aria-hidden="true" />
              </Link>
            </div>
            {outcomes.length === 0 ? (
              <EmptyState
                title="No experiments yet"
                body="Results need experiments to learn from. Define one with a pre-declared success metric, then conclusions here draft themselves from recorded outcomes."
                icon={<FlaskConical size={22} className="text-forest" />}
                action={<Link href="/app/experiments" className="text-sm font-medium text-forest hover:underline">Create the first experiment</Link>}
              />
            ) : (
              <ul className="mt-3 divide-y divide-bark/10">
                {outcomes.slice(0, 6).map((row) => {
                  const sig = SIGNAL_STYLE[row.signal];
                  const conf = CONFIDENCE_STYLE[row.confidence];
                  return (
                    <li key={row.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-charcoal">
                          {row.title}
                          {row.channel && <span className="font-normal text-charcoal-soft"> · {row.channel}</span>}
                        </p>
                        <span className="flex items-center gap-1.5">
                          <Badge variant={sig.variant}>{sig.label}</Badge>
                          <Badge variant={conf.variant}>{conf.label} confidence</Badge>
                        </span>
                      </div>
                      {row.keyResults.length > 0 && (
                        <p className="mt-1 text-xs text-charcoal-soft">{row.keyResults.join(" · ")}</p>
                      )}
                      <p className="mt-1 text-xs leading-relaxed text-charcoal-soft/90">{row.signalDetail}</p>
                      {row.decision && (
                        <p className="mt-1.5 rounded-lg bg-forest/5 px-2 py-1 text-xs text-forest-deep">
                          <span className="font-semibold">Recorded next step:</span> {row.decision}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 border-t border-bark/10 pt-2 text-[11px] text-charcoal-soft">
              Confidence reflects evidence breadth (numbers + drafted interpretation), not statistical power — Banyan never
              claims high confidence without a recorded baseline.
            </p>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="h-full">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium text-charcoal">Open synthesis</h2>
              <Badge variant="moss">based on recorded data</Badge>
            </div>
            {openRecommendations.length === 0 ? (
              <p className="mt-2 text-sm text-charcoal-soft">
                No open recommendations. The analyst produces them when recorded outcomes warrant a next move — nothing is
                generated for its own sake.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {openRecommendations.map((r) => {
                  let evidenceCount = 0;
                  try { evidenceCount = (JSON.parse(r.evidence) as unknown[]).length; } catch { /* recorded as zero */ }
                  return (
                    <li key={r.id} className="rounded-lg border border-bark/15 bg-ivory/60 p-2.5">
                      <p className="text-sm font-medium text-charcoal">{r.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-charcoal-soft">{r.rationale.slice(0, 180)}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-charcoal-soft">
                        <Badge variant={r.confidence === "high" ? "forest" : r.confidence === "medium" ? "moss" : "warm"}>{r.confidence} confidence</Badge>
                        <span>{evidenceCount} evidence citation(s)</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link href="/app/opportunities" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-forest hover:underline">
              Review recommended next steps <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </Card>
        </div>
      </div>

      {/* ————— What appears to be working ————— */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-medium text-charcoal"><LineChart size={15} className="text-forest" aria-hidden="true" /> What appears to be working</h2>
          <p className="text-xs text-charcoal-soft">Ranked by downstream outcomes · correlations are directional, not causal</p>
        </div>
        {performance.length === 0 ? (
          <p className="mt-3 text-sm text-charcoal-soft">No active campaigns yet — this ranking appears once campaigns record tracked traffic.</p>
        ) : (
          <ul className="mt-4 space-y-3.5">
            {performance.map((row) => (
              <li key={row.campaignId} className="grid gap-2 sm:grid-cols-[minmax(0,2fr),3fr]">
                <div className="min-w-0">
                  <Link href={`/app/campaigns/${row.campaignId}`} className="truncate text-sm font-medium text-charcoal hover:text-forest">
                    {row.campaignName}
                  </Link>
                  <p className="text-[11px] text-charcoal-soft">
                    {row.channelLabel ?? "no channel set"} · {row.clicks} click(s) · {row.signups} signup(s) · {row.activations} activation(s)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-ivory-deep/70" aria-hidden="true">
                    <div className="h-full bg-sage" style={{ width: `${Math.max(2, Math.round((row.clicks / maxClicks) * 100))}%` }}>
                      <div className="h-full bg-forest" style={{ width: `${row.clicks > 0 ? Math.round((row.activations / row.clicks) * 100) : 0}%` }} />
                    </div>
                  </div>
                  <Badge variant={STRENGTH_STYLE[row.signalStrength].variant}>{STRENGTH_STYLE[row.signalStrength].label}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-bark/10 pt-2 text-[11px] text-charcoal-soft">
          Bar: outer = tracked clicks, inner = activations within clicks. Strength thresholds are absolute counts of
          activations — a rate on two clicks would lie.
        </p>
      </Card>

      {/* ————— Data health & recent decisions ————— */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Card className="h-full">
            <h2 className="font-medium text-charcoal">Data health &amp; attribution</h2>
            <ul className="mt-3 space-y-2.5">
              {health.map((h) => (
                <li key={h.key} className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${HEALTH_STYLE[h.status].dot}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-xs font-medium text-charcoal">
                      {h.label}
                      <span className="font-normal text-charcoal-soft">{HEALTH_STYLE[h.status].label}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-charcoal-soft">{h.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/app/connections" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-forest hover:underline">
              Review connections <ArrowRight size={11} aria-hidden="true" />
            </Link>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card className="h-full">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-medium text-charcoal"><Activity size={15} className="text-forest" aria-hidden="true" /> Recent agent decisions</h2>
              <Link href="/app/activity" className="inline-flex items-center gap-1 text-xs font-medium text-forest hover:underline">
                Full agent activity <ArrowRight size={11} aria-hidden="true" />
              </Link>
            </div>
            {decisions.length === 0 ? (
              <p className="mt-2 text-sm text-charcoal-soft">
                No recorded decisions yet. Approving a plan, concluding an experiment, or accepting an opportunity writes
                one here — with its evidence.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-bark/10">
                {decisions.map((d, i) => (
                  <li key={i} className="py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-charcoal">
                        <span className="font-medium">{d.agent}</span> — {d.action}
                      </p>
                      <span className="text-[11px] text-charcoal-soft">{d.at.toLocaleDateString()}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-charcoal-soft">{d.evidence}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
