import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import {
  computeDataFlow,
  computeLoopSetup,
  CONNECTION_CATALOG,
  timeAgo,
  type FlowHealth,
  type CatalogStatus,
} from "@/lib/growth-loop";
import {
  ArrowRight, AlertTriangle, CheckCircle2, CircleDashed, Lock, KeyRound,
  ToggleLeft, Users, ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = { title: "Connections" };

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

const HEALTH_STYLE: Record<FlowHealth, { dot: string; label: string }> = {
  flowing: { dot: "bg-forest", label: "Flowing" },
  stalled: { dot: "bg-amber-500", label: "Stalled" },
  not_started: { dot: "bg-bark/30", label: "Not started" },
};

const CATALOG_STYLE: Record<CatalogStatus, { variant: "forest" | "moss" | "charcoal"; label: string }> = {
  available: { variant: "forest", label: "Connectable now" },
  first_party: { variant: "moss", label: "First-party — works today" },
  not_available: { variant: "charcoal", label: "Not built yet" },
};

type DataQualityHint = {
  tone: "warn" | "ok" | "info";
  title: string;
  detail: string;
  href?: string;
  cta?: string;
};

export default async function ConnectionsPage() {
  const ctx = await requireWorkspaceServer();
  const wid = ctx.workspace.id;
  const now = new Date();
  const d14 = new Date(now.getTime() - 14 * DAY);

  const [
    profile,
    factsCount,
    connections,
    linksAgg,
    approvedCount,
    publishedCount,
    visitCount,
    signupTotal,
    signupAttributed,
    activatedCount,
    experimentsTotal,
    experimentsConcluded,
    blockedTasks,
    latestErrorEvents,
  ] = await Promise.all([
    prisma.productProfile.findUnique({ where: { workspaceId: wid } }),
    prisma.profileFact.count({ where: { workspaceId: wid } }),
    prisma.channelConnection.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" } }),
    prisma.trackedLink.aggregate({ where: { workspaceId: wid }, _count: true }),
    prisma.contentItem.count({ where: { workspaceId: wid, status: { in: ["approved", "scheduled", "publishing", "published"] }, updatedAt: { gte: d14 } } }),
    prisma.publication.count({ where: { contentItem: { workspaceId: wid }, status: "published", updatedAt: { gte: d14 } } }),
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "visit", createdAt: { gte: d14 } } }),
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "signup", createdAt: { gte: d14 } } }),
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "signup", createdAt: { gte: d14 }, OR: [{ linkId: { not: null } }, { campaignId: { not: null } }] } }),
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "onboarding_complete", createdAt: { gte: d14 } } }),
    prisma.experiment.count({ where: { workspaceId: wid } }),
    prisma.experiment.count({ where: { workspaceId: wid, status: "complete" } }),
    prisma.agentTask.findMany({ where: { workspaceId: wid, status: { in: ["blocked", "failed"] } }, orderBy: { updatedAt: "desc" }, take: 3, select: { id: true, title: true, goalId: true, updatedAt: true } }),
    prisma.activityEvent.findMany({ where: { workspaceId: wid, type: { in: ["publication_failed", "publication_blocked"] } }, orderBy: { createdAt: "desc" }, take: 2, select: { summary: true, createdAt: true } }),
  ]);

  const setup = computeLoopSetup({
    profileName: profile?.name ?? null,
    contextFacts: factsCount,
    publishingConnections: connections.filter((c) => c.status !== "error").length,
    trackedLinks: linksAgg._count,
    experiments: experimentsTotal,
  });

  const flow = computeDataFlow({
    approvedCount,
    publishedCount,
    visitCount,
    attributedSignups: signupAttributed,
    activatedCount,
    concludedExperiments: experimentsConcluded,
  });

  // ————— Data quality hints — every line traces to a recorded state —————
  const hints: DataQualityHint[] = [];
  for (const c of connections.filter((c) => c.status === "error")) {
    hints.push({
      tone: "warn",
      title: `${c.label || c.channel} connection error`,
      detail: c.lastError ? c.lastError.slice(0, 160) : "The provider reported an error on the last check.",
      href: "/app/publishing",
      cta: "Fix connection",
    });
  }
  for (const c of connections.filter((c) => c.status === "configured")) {
    hints.push({
      tone: "info",
      title: `${c.label || c.channel} configured but not yet verified`,
      detail: "The connection has not completed a successful provider check yet, so publications through it stay blocked until it verifies.",
      href: "/app/publishing",
      cta: "Verify now",
    });
  }
  if (signupTotal > 0 && signupAttributed < signupTotal) {
    hints.push({
      tone: "warn",
      title: `${signupTotal - signupAttributed} signup(s) missing campaign source`,
      detail: "These signups arrived without tracked-link or campaign attribution, so they cannot be tied back to the content that earned them.",
      href: "/app/campaigns",
      cta: "Add tracked links",
    });
  }
  for (const t of blockedTasks) {
    hints.push({
      tone: "warn",
      title: `Blocked agent task: ${t.title}`,
      detail: `The workflow has been stuck here since ${timeAgo(t.updatedAt, now)} — downstream steps wait on it.`,
      href: t.goalId ? `/app/goals/${t.goalId}` : "/app/goals",
      cta: "Open goal",
    });
  }
  for (const e of latestErrorEvents) {
    hints.push({
      tone: "warn",
      title: "Recent publication failure",
      detail: e.summary.slice(0, 160),
      href: "/app/publishing",
      cta: "Review publishing",
    });
  }
  if (hints.length === 0) {
    hints.push({
      tone: "ok",
      title: "No data quality issues detected",
      detail: "Connections verified, signups attributed, no blocked tasks. Zeros here are true zeros.",
    });
  }

  return (
    <>
      <PageHeader
        title="Connections"
        description="Connect the tools that let the agents execute and measure growth — and see exactly how data moves through the loop. Banyan only claims what it has verified; every gap below is real."
        actions={<LinkButton href="/app/publishing" variant="secondary">Manage publishing connections</LinkButton>}
      />

      {/* ————— 1. Growth loop setup — N of 5 real slots ————— */}
      <Card className="rooted">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="font-medium text-charcoal">Growth loop setup</h2>
            <p className="mt-0.5 text-xs text-charcoal-soft">{setup.connected} of {setup.total} connected — each slot is a recorded state, not a promise.</p>
          </div>
          <div className="w-full max-w-56 max-lg:max-w-none" role="progressbar" aria-valuenow={setup.connected} aria-valuemin={0} aria-valuemax={setup.total} aria-label="Growth loop setup progress">
            <p className="mb-1.5 text-right font-serif text-xl text-forest-deep">{setup.connected}/{setup.total}</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-ivory-deep/70">
              <div className="h-full rounded-full bg-forest" style={{ width: `${(setup.connected / setup.total) * 100}%` }} />
            </div>
          </div>
        </div>
        <ol className="mt-5 grid gap-3 border-t border-bark/10 pt-4 md:grid-cols-5">
          {setup.slots.map((slot, i) => (
            <li key={slot.key} className="flex flex-col items-start gap-1.5">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full ${slot.status === "connected" ? "bg-forest text-ivory" : "bg-ivory-deep text-charcoal-soft"}`}>
                  {slot.status === "connected" ? <CheckCircle2 size={12} /> : <span className="text-[10px] font-semibold">{i + 1}</span>}
                </span>
                <span className={`text-xs font-semibold ${slot.status === "connected" ? "text-forest" : "text-charcoal-soft"}`}>{slot.label}</span>
              </span>
              <span className={`text-[11px] font-medium ${slot.status === "connected" ? "text-forest" : "text-clay"}`}>{slot.status === "connected" ? "Connected" : "Needs setup"}</span>
              <p className="text-[11px] leading-relaxed text-charcoal-soft">{slot.detail}</p>
              <Link href={slot.href} className="mt-auto inline-flex items-center gap-1 text-[11px] font-medium text-forest hover:underline">
                {slot.cta} <ArrowRight size={10} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      {/* ————— 2. Data flow — the recorded pipeline with live counts ————— */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium text-charcoal">Data flow</h2>
          <p className="text-xs text-charcoal-soft">How your tools work together to power agentic growth · last 14 days</p>
        </div>
        <ol className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          {flow.map((step, i) => {
            const style = HEALTH_STYLE[step.health];
            return (
              <li key={step.key} className="relative rounded-[3px] border border-bark/15 bg-ivory/60 p-3">
                {i < flow.length - 1 && (
                  <ArrowRight className="absolute -right-2.5 top-4 z-10 hidden text-bark/40 lg:block" size={13} aria-hidden="true" />
                )}
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${style.dot}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-soft">{style.label}</span>
                </span>
                <p className="mt-1.5 font-serif text-xl text-forest-deep">{step.count.toLocaleString()}</p>
                <p className="text-xs font-medium text-charcoal">{step.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-charcoal-soft/80">{step.sub}</p>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-[11px] leading-relaxed text-charcoal-soft">
          A step marked <span className="font-medium text-charcoal">stalled</span> has upstream activity but no events of its own — a real break in the loop worth investigating, not an estimate. Counts come only from first-party records.
        </p>
      </Card>

      {/* ————— 3. Connections overview + data quality ————— */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card className="h-full">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium text-charcoal">Your connections</h2>
              <Badge variant={connections.some((c) => c.status !== "error") ? "forest" : "warm"}>
                {connections.filter((c) => c.status !== "error").length} active
              </Badge>
            </div>
            {connections.length === 0 ? (
              <p className="mt-3 text-sm text-charcoal-soft">
                No provider connections yet. Publishing runs through Postiz (verified against its public API), or you can record manual publications with the live URL — the honest fallback that is always available.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-bark/10">
                {connections.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-charcoal">{c.label || c.channel}</span>
                      <span className="block text-[11px] text-charcoal-soft">
                        {c.adapter} · {c.channel} · last checked {c.lastCheckedAt ? timeAgo(c.lastCheckedAt, now) : "never"}
                      </span>
                      {c.lastError && <span className="mt-0.5 block truncate text-[11px] text-clay">{c.lastError}</span>}
                    </span>
                    <Badge variant={c.status === "error" ? "warm" : c.status === "verified" ? "forest" : "charcoal"}>{c.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/app/publishing" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-forest hover:underline">
              Manage connections <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="h-full">
            <h2 className="font-medium text-charcoal">Data quality</h2>
            <p className="mt-0.5 text-xs text-charcoal-soft">Recorded issues only — nothing here is inferred.</p>
            <ul className="mt-3 space-y-2.5">
              {hints.map((h, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0" aria-hidden="true">
                    {h.tone === "warn" ? (
                      <AlertTriangle size={14} className="text-clay" />
                    ) : h.tone === "ok" ? (
                      <CheckCircle2 size={14} className="text-forest" />
                    ) : (
                      <CircleDashed size={14} className="text-charcoal-soft" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-charcoal">{h.title}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-charcoal-soft">{h.detail}</span>
                    {h.href && h.cta && (
                      <Link href={h.href} className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-forest hover:underline">
                        {h.cta} <ArrowRight size={10} aria-hidden="true" />
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {/* ————— 4. Connection catalog — what each slot is, honestly ————— */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-charcoal">Connection catalog</h2>
          <p className="text-xs text-charcoal-soft">What each integration is today — capability vs. integration, stated plainly.</p>
        </div>
        <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CONNECTION_CATALOG.map((entry) => {
            const style = CATALOG_STYLE[entry.status];
            return (
              <li key={entry.key} className="flex flex-col rounded-[3px] border border-bark/15 bg-ivory/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-charcoal">
                    {entry.name} <span className="font-normal text-charcoal-soft">· {entry.provider}</span>
                  </span>
                  <Badge variant={style.variant}>{style.label}</Badge>
                </div>
                <dl className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
                  <div>
                    <dt className="font-semibold text-charcoal">Data you&apos;ll get</dt>
                    <dd className="text-charcoal-soft">{entry.whatYouGet}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-charcoal">Use cases</dt>
                    <dd className="text-charcoal-soft">{entry.useCases}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-charcoal">How it works today</dt>
                    <dd className="text-charcoal-soft">{entry.howToday}</dd>
                  </div>
                </dl>
                <Link href={entry.href} className="mt-auto inline-flex items-center gap-1 pt-2.5 text-xs font-medium text-forest hover:underline">
                  {entry.cta} <ArrowRight size={11} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ————— 5. Access & data use — how Banyan treats your data ————— */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-charcoal">Access &amp; data use</h2>
          <p className="text-xs text-charcoal-soft">Your data is secure, and only what is needed is accessed.</p>
        </div>
        <div className="mt-4 grid gap-4 border-t border-bark/10 pt-4 md:grid-cols-4">
          <div className="flex items-start gap-2.5">
            <Lock size={15} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-charcoal">Encrypted &amp; secure</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-charcoal-soft">Connection credentials are encrypted at rest with AES-256-GCM and never rendered back in plaintext.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <KeyRound size={15} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-charcoal">Minimal, necessary permissions</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-charcoal-soft">Providers are used only for publish and status checks. Every capability is listed with what it can and cannot do.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <ToggleLeft size={15} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-charcoal">Your control</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-charcoal-soft">Disconnect any integration at any time — access stops immediately. Manual recording always works as the fallback.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Users size={15} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-charcoal">Workspace boundaries</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-charcoal-soft">Every query is scoped to your workspace; members without the right role cannot reach connections or approvals.</p>
            </div>
          </div>
        </div>
        <p className="mt-4 flex items-start gap-1.5 border-t border-bark/10 pt-3 text-[11px] leading-relaxed text-charcoal-soft">
          <ShieldCheck size={12} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
          Approval gates are enforced server-side: nothing publishes without a recorded human decision, and a publication counts as confirmed only when the provider confirms it.
        </p>
      </Card>
    </>
  );
}
