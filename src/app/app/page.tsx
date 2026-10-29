import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, EmptyState, PageHeader, StatusBadge, LinkButton } from "@/components/ui";
import { Sparkline } from "@/components/Sparkline";
import {
  computeAgentTeam, attributionCoverage, resolveActivityEvidence, timeAgo,
  AGENT_META, type AgentRoleStatus,
} from "@/lib/growth-loop";
import {
  ArrowRight, AlertTriangle, CheckCircle2, FlaskConical, Lightbulb, Play,
  Share2, Sparkles, Target, TrendingUp, TrendingDown, Bot, Activity,
} from "lucide-react";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

/** Funnel stage definitions mirror the first-party events the app records. */
const FUNNEL_STAGES: { type: string; label: string; sub: string }[] = [
  { type: "visit", label: "Tracked visits", sub: "Clicks through your links" },
  { type: "signup", label: "Signups", sub: "Attributed arrivals" },
  { type: "onboarding_complete", label: "Activated", sub: "Completed onboarding" },
];

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  const tomorrow = new Date(now.getTime() + DAY);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

export default async function DashboardPage() {
  const ctx = await requireWorkspaceServer();
  const wid = ctx.workspace.id;
  const now = new Date();
  const d14 = new Date(now.getTime() - 14 * DAY);
  const d28 = new Date(now.getTime() - 28 * DAY);

  const [
    profile,
    goals,
    pendingApprovals,
    published,
    scheduled,
    linksAgg,
    recommendations,
    blockedTasks,
    connections,
    funnelNow,
    funnelPrev,
    visitEvents,
    runningExperiment,
    latestExperiment,
    agentTasks,
    activityEvents,
    attributedSignups,
  ] = await Promise.all([
    prisma.productProfile.findUnique({ where: { workspaceId: wid } }),
    prisma.goal.findMany({ where: { workspaceId: wid, status: { in: ["planning", "awaiting_approval", "active", "paused"] } }, orderBy: { updatedAt: "desc" }, take: 3 }),
    prisma.contentItem.findMany({ where: { workspaceId: wid, status: "ready_for_review" }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.publication.findMany({ where: { contentItem: { workspaceId: wid }, status: "published" }, orderBy: { publishedAt: "desc" }, take: 3, include: { contentItem: { select: { title: true, channel: true } } } }),
    prisma.publication.findMany({ where: { contentItem: { workspaceId: wid }, status: "scheduled" }, orderBy: { scheduledFor: "asc" }, take: 3, include: { contentItem: { select: { title: true, channel: true } } } }),
    prisma.trackedLink.aggregate({ where: { workspaceId: wid }, _sum: { clicks: true }, _count: true }),
    prisma.recommendation.findMany({ where: { workspaceId: wid, status: "open" }, orderBy: { createdAt: "desc" } }),
    prisma.agentTask.findMany({ where: { workspaceId: wid, status: { in: ["blocked", "failed"] } }, orderBy: { updatedAt: "desc" }, take: 2 }),
    prisma.channelConnection.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" } }),
    prisma.metricEvent.groupBy({ by: ["type"], where: { workspaceId: wid, createdAt: { gte: d14 } }, _count: true }),
    prisma.metricEvent.groupBy({ by: ["type"], where: { workspaceId: wid, createdAt: { gte: d28, lt: d14 } }, _count: true }),
    prisma.metricEvent.findMany({ where: { workspaceId: wid, type: "visit", createdAt: { gte: d14 } }, select: { createdAt: true } }),
    prisma.experiment.findFirst({ where: { workspaceId: wid, status: "running" }, orderBy: { updatedAt: "desc" } }),
    prisma.experiment.findFirst({ where: { workspaceId: wid }, orderBy: { updatedAt: "desc" } }),
    prisma.agentTask.findMany({ where: { workspaceId: wid }, orderBy: { updatedAt: "desc" }, take: 120, select: { agentRole: true, status: true, title: true, goalId: true, updatedAt: true } }),
    prisma.activityEvent.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, type: true, actorType: true, actorSummary: true, summary: true, meta: true, createdAt: true } }),
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "signup", createdAt: { gte: d14 }, OR: [{ linkId: { not: null } }, { campaignId: { not: null } }] } }),
  ]);

  const activeGoal = goals.find((g) => g.status === "active") ?? goals[0] ?? null;
  const goalTasks = activeGoal
    ? await prisma.agentTask.findMany({ where: { goalId: activeGoal.id }, orderBy: { createdAt: "asc" } })
    : [];
  const runningTasks = goalTasks.filter((t) => ["ready", "running"].includes(t.status));
  const awaitingTasks = goalTasks.filter((t) => t.status === "waiting_approval");

  // Rule-based setup suggestions remain for onboarding steps the agent cannot do for you.
  const setupSuggestions: { label: string; href: string; why: string }[] = [];
  if (!profile?.name) setupSuggestions.push({ label: "Complete your product profile", href: "/app/workspace", why: "The agents have nothing to ground plans and drafts in yet." });
  if (profile && goals.length === 0) setupSuggestions.push({ label: "Set your first goal", href: "/app/goals", why: "One sentence is enough — Banyan drafts the plan and asks before acting." });
  if (pendingApprovals.length > 0) setupSuggestions.push({ label: `Review ${pendingApprovals.length} item(s) awaiting approval`, href: "/app/approvals", why: "Nothing can publish without your recorded approval." });

  // ————— Funnel: real counts + real 14-day deltas (never estimated) —————
  const countNow = (type: string) => funnelNow.find((f) => f.type === type)?._count ?? 0;
  const countPrev = (type: string) => funnelPrev.find((f) => f.type === type)?._count ?? 0;

  // Daily tracked-visit series for the sparkline — true zeros included.
  const dayBuckets = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    dayBuckets.set(new Date(now.getTime() - i * DAY).toDateString(), 0);
  }
  for (const e of visitEvents) {
    const key = e.createdAt.toDateString();
    if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
  }
  const visitSeries = [...dayBuckets.values()];
  const totalVisits14 = visitSeries.reduce((a, b) => a + b, 0);

  // ————— This week's growth focus: the highest-leverage moves, in one list —————
  type FocusItem = { id: string; title: string; body: string; badge: React.ReactNode; cta: { href: string; label: string }; evidence?: string };
  const focus: FocusItem[] = [];
  for (const t of blockedTasks) {
    focus.push({
      id: t.id, title: t.title,
      body: t.lastError ? t.lastError.slice(0, 140) : `Blocked ${t.type.replace(/_/g, " ")} task — fix it to unblock the workflow.`,
      badge: <StatusBadge status={t.status} />,
      cta: { href: t.goalId ? `/app/goals/${t.goalId}` : "/app/goals", label: "Open goal" },
    });
  }
  for (const c of pendingApprovals.slice(0, 2)) {
    focus.push({
      id: c.id, title: c.title,
      body: "Content is ready for your recorded approval — nothing publishes without it.",
      badge: <StatusBadge status={c.status} />,
      cta: { href: `/app/content/${c.id}`, label: "Review" },
      evidence: c.channel,
    });
  }
  for (const t of awaitingTasks.slice(0, 2)) {
    focus.push({
      id: t.id, title: t.title,
      body: "An approval gate is waiting on your decision.",
      badge: <StatusBadge status={t.status} />,
      cta: { href: t.goalId ? `/app/goals/${t.goalId}` : "/app/goals", label: "Review" },
    });
  }
  for (const t of runningTasks.slice(0, 2)) {
    focus.push({
      id: t.id, title: t.title,
      body: `${t.agentRole ? t.agentRole.charAt(0).toUpperCase() + t.agentRole.slice(1) : "Agent"} working on the ${t.type.replace(/_/g, " ")} step.`,
      badge: <StatusBadge status={t.status} />,
      cta: { href: t.goalId ? `/app/goals/${t.goalId}` : "/app/goals", label: "Open goal" },
    });
  }
  const topRec = recommendations[0] ?? null;
  if (topRec) {
    focus.push({
      id: topRec.id, title: topRec.title,
      body: topRec.rationale.slice(0, 160),
      badge: <Badge variant="warm">Next test</Badge>,
      cta: { href: `/app/experiments?title=${encodeURIComponent(topRec.title)}`, label: "Create experiment" },
      evidence: topRec.confidence ? `${topRec.confidence} confidence` : undefined,
    });
  }
  const focusItems = focus.slice(0, 5);

  // ————— Agent team + activity feed + attribution coverage (from records only) —————
  const agentTeam = computeAgentTeam(agentTasks);
  const coverage = attributionCoverage(countNow("signup"), attributedSignups);

  const experiment = runningExperiment ?? null;
  const experimentDay = experiment ? Math.max(1, Math.floor((now.getTime() - experiment.createdAt.getTime()) / DAY) + 1) : 0;
  const connectionsLive = connections.filter((c) => c.status !== "error");
  const trackedClicks = linksAgg._sum.clicks ?? 0;

  return (
    <>
      <PageHeader
        title="Growth workspace"
        description="Turn ideas into traction. The goal in motion, this week's highest-leverage moves, and what the evidence says — zeros are true zeros; anything unmeasured is labeled as such."
        actions={<LinkButton href="/app/experiments" variant="secondary"><FlaskConical size={15} aria-hidden="true" /> New experiment</LinkButton>}
      />

      {/* ————— 1. Goal — the trunk everything grows from ————— */}
      {activeGoal ? (
        <Card className="rooted">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-charcoal-soft">
                <Target size={14} className="text-forest" aria-hidden="true" /> Goal
              </p>
              <Link href={`/app/goals/${activeGoal.id}`} className="mt-1.5 block text-lg font-medium text-charcoal hover:text-forest">
                {activeGoal.objective}
              </Link>
              <p className="mt-1 text-sm text-charcoal-soft">
                {activeGoal.successMetric}
                {activeGoal.metricTarget != null ? ` · target ${activeGoal.metricTarget.toLocaleString()}${activeGoal.metricUnit ? ` ${activeGoal.metricUnit}` : ""}` : ""}
                {activeGoal.deadline ? ` · by ${activeGoal.deadline.toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <StatusBadge status={activeGoal.status} />
                <Link href="/app/strategy" className="text-xs font-medium text-forest hover:underline">View strategy →</Link>
              </div>
            </div>
            <div className="w-full max-w-56 max-lg:max-w-none">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-serif text-3xl text-forest-deep">{Math.round(activeGoal.progress)}%</span>
                <span className="text-xs text-charcoal-soft">
                  {goalTasks.filter((t) => t.status === "completed").length}/{goalTasks.filter((t) => t.status !== "cancelled").length} tasks
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ivory-deep/70" role="progressbar" aria-valuenow={activeGoal.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Goal progress">
                <div className="h-full rounded-full bg-forest" style={{ width: `${Math.min(100, activeGoal.progress)}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-charcoal-soft">Progress from task completion, recomputed by the orchestrator.</p>
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState
          title={goals.length === 0 ? "Plant the first goal" : "No goal in motion"}
          body="State what you want in plain language — the planner drafts a reviewable plan, agents execute it step by step, and nothing publishes without your approval."
          icon={<Target size={22} className="text-forest" />}
          action={<LinkButton href="/app/goals">Create your first goal</LinkButton>}
        />
      )}

      {/* ————— 2/3. This week's focus + active experiment ————— */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium text-charcoal">This week&apos;s growth focus</h2>
            <p className="text-xs text-charcoal-soft">High-leverage moves toward the goal</p>
          </div>
          {focusItems.length === 0 ? (
            <p className="mt-3 text-sm text-charcoal-soft">
              {activeGoal
                ? "The planner is drafting the plan — refresh in a moment."
                : "Nothing in motion yet. Set a goal and the focus list fills with the agent workflow's next moves."}
            </p>
          ) : (
            <ol className="mt-3 space-y-3">
              {focusItems.map((item, i) => (
                <li key={item.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage/50 text-xs font-semibold text-forest-deep" aria-hidden="true">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-charcoal">{item.title}</p>
                      {item.badge}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-charcoal-soft">{item.body}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3">
                      <Link href={item.cta.href} className="inline-flex items-center gap-1 text-xs font-medium text-forest hover:underline">
                        {item.cta.label} <ArrowRight size={11} aria-hidden="true" />
                      </Link>
                      {item.evidence && <span className="text-[11px] text-charcoal-soft/80">Evidence: {item.evidence}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium text-charcoal">Active experiment</h2>
            {experiment ? (
              <Badge variant="forest"><span className="h-1.5 w-1.5 rounded-full bg-forest" aria-hidden="true" /> Running · day {experimentDay}</Badge>
            ) : latestExperiment ? (
              <StatusBadge status={latestExperiment.status} />
            ) : null}
          </div>
          {experiment ? (
            <>
              <p className="mt-2 text-sm font-medium text-charcoal">{experiment.title}</p>
              <div className="mt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-soft">Hypothesis</p>
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-charcoal-soft">{experiment.hypothesis}</p>
              </div>
              <dl className="mt-3 space-y-1 border-t border-bark/10 pt-3 text-xs">
                <div className="flex justify-between gap-2"><dt className="text-charcoal-soft">Variable</dt><dd className="truncate font-medium text-charcoal">{experiment.variable}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-charcoal-soft">Success metric</dt><dd className="truncate font-medium text-charcoal">{experiment.successMetric}</dd></div>
                {experiment.channel && <div className="flex justify-between gap-2"><dt className="text-charcoal-soft">Channel</dt><dd className="font-medium text-charcoal">{experiment.channel}</dd></div>}
              </dl>
              <p className="mt-3 text-[11px] leading-relaxed text-charcoal-soft">
                Conclusions are drafted from recorded outcomes when the experiment concludes — numbers are never estimated mid-run.
              </p>
            </>
          ) : latestExperiment ? (
            <>
              <p className="mt-2 text-sm font-medium text-charcoal">{latestExperiment.title}</p>
              {latestExperiment.interpretation && (
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-charcoal-soft">{latestExperiment.interpretation}</p>
              )}
              <p className="mt-3 text-[11px] text-charcoal-soft">No experiment is running. Start the next one from what was learned.</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-charcoal-soft">No experiments yet — one variable at a time, with a pre-declared success metric.</p>
          )}
          <Link href="/app/experiments" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-forest hover:underline">
            Open experiments <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </Card>
      </div>

      {/* ————— 4/5. Customer journey + publishing ————— */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium text-charcoal">Customer journey</h2>
            <p className="text-xs text-charcoal-soft">First-party events · last 14 days</p>
          </div>
          <div className="mt-4 grid grid-cols-3 items-start gap-2">
            {FUNNEL_STAGES.map((stage, i) => {
              const cur = countNow(stage.type);
              const prev = countPrev(stage.type);
              const delta = prev > 0 && cur !== prev ? Math.round(((cur - prev) / prev) * 100) : null;
              return (
                <div key={stage.type} className="relative">
                  {i < FUNNEL_STAGES.length - 1 && (
                    <ArrowRight className="absolute -right-2.5 top-4 hidden text-bark/30 sm:block" size={14} aria-hidden="true" />
                  )}
                  <p className="font-serif text-2xl text-forest-deep">{cur.toLocaleString()}</p>
                  <p className="mt-0.5 text-xs font-medium text-charcoal">{stage.label}</p>
                  <p className="text-[11px] text-charcoal-soft/80">{stage.sub}</p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-charcoal-soft">
                    {delta != null && (
                      delta > 0 ? <TrendingUp size={11} className="text-forest" aria-hidden="true" /> : <TrendingDown size={11} className="text-clay" aria-hidden="true" />
                    )}
                    {delta != null
                      ? `${delta > 0 ? "+" : ""}${delta}% vs previous 14 days`
                      : prev === 0 && cur > 0
                        ? "first events in this window"
                        : cur === 0
                          ? "no events recorded yet"
                          : "flat vs previous 14 days"}
                  </p>
                </div>
              );
            })}
          </div>
          {totalVisits14 > 1 && (
            <div className="mt-4 border-t border-bark/10 pt-3">
              <p className="text-[11px] text-charcoal-soft">Tracked visits per day (recorded events, true zeros included)</p>
              <Sparkline points={visitSeries} label="Tracked visits per day over the last 14 days" />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-bark/10 pt-3">
            <p className="text-xs text-charcoal-soft">Attribution coverage — signups traceable to a tracked source</p>
            {coverage != null ? (
              <p className="flex items-center gap-2 text-sm">
                <span className="font-serif text-lg text-forest-deep">{coverage}%</span>
                <span className="text-[11px] text-charcoal-soft">of {countNow("signup").toLocaleString()} signup(s)</span>
              </p>
            ) : (
              <p className="text-[11px] text-charcoal-soft">Not enough data yet</p>
            )}
          </div>
          {coverage != null && coverage < 100 && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-clay">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
              {countNow("signup") - attributedSignups} signup(s) have no tracked source — UTM-tagged links close the gap (<Link href="/app/connections" className="underline hover:text-charcoal">data quality</Link>).
            </p>
          )}
          {trackedClicks > 0 && (
            <p className="mt-2 text-xs text-charcoal-soft">
              {trackedClicks.toLocaleString()} click(s) recorded across {linksAgg._count} tracked link(s) in total.
            </p>
          )}
          <Link href="/app/analytics" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-forest hover:underline">
            View details <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-medium text-charcoal"><Share2 size={15} className="text-forest" aria-hidden="true" /> Publishing</h2>
            {connectionsLive.length > 0 ? (
              <Badge variant="forest"><span className="h-1.5 w-1.5 rounded-full bg-forest" aria-hidden="true" /> Connected</Badge>
            ) : (
              <Badge variant="warm">No connection</Badge>
            )}
          </div>
          {connectionsLive.length > 0 && (
            <p className="mt-1.5 text-xs text-charcoal-soft">
              {connectionsLive.map((c) => `${c.label || c.channel} · ${c.adapter}`).join(" · ")}
            </p>
          )}
          {scheduled.length > 0 && (
            <ul className="mt-3 space-y-2 border-t border-bark/10 pt-3">
              {scheduled.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <Link href={`/app/content/${p.contentItemId}`} className="block truncate text-sm text-charcoal hover:text-forest">{p.contentItem.title}</Link>
                    <span className="text-[11px] text-charcoal-soft">{p.scheduledFor ? fmtDate(p.scheduledFor) : "unscheduled"} · {p.contentItem.channel}</span>
                  </span>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
          {published.length > 0 && (
            <ul className="mt-3 space-y-2 border-t border-bark/10 pt-3">
              {published.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <Link href={`/app/content/${p.contentItemId}`} className="block truncate text-sm text-charcoal hover:text-forest">{p.contentItem.title}</Link>
                    <span className="text-[11px] text-charcoal-soft">published {p.publishedAt ? fmtDate(p.publishedAt) : ""}</span>
                  </span>
                  <Badge variant={p.manual ? "warm" : "moss"}>{p.manual ? "manual" : p.provider}</Badge>
                </li>
              ))}
            </ul>
          )}
          {scheduled.length === 0 && published.length === 0 && (
            <p className="mt-3 text-sm text-charcoal-soft">
              Nothing scheduled or published yet. Approved content scheduled through a connection — or recorded manually — appears here with its real status.
            </p>
          )}
          <Link href="/app/calendar" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-forest hover:underline">
            Open publishing calendar <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </Card>
      </div>

      {/* ————— 6. Agent team + recent activity — the runtime, visible ————— */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-medium text-charcoal"><Bot size={15} className="text-forest" aria-hidden="true" /> Agent team</h2>
            <Link href="/app/activity" className="text-xs font-medium text-forest hover:underline">View activity →</Link>
          </div>
          <ul className="mt-3 space-y-3">
            {agentTeam.map((a) => (
              <li key={a.role} className="flex items-start gap-2.5">
                <span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${AGENT_STATUS_STYLE[a.status].dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <Link href={a.href} className="text-sm font-medium text-charcoal hover:text-forest">{AGENT_META[a.role].name}</Link>
                    <span className={`text-[11px] font-medium ${AGENT_STATUS_STYLE[a.status].text}`}>{AGENT_STATUS_STYLE[a.status].label}</span>
                    {a.at && <span className="text-[11px] text-charcoal-soft/70">{timeAgo(a.at, now)}</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-charcoal-soft" title={a.latestAction ?? AGENT_META[a.role].blurb}>
                    {a.latestAction ?? AGENT_META[a.role].blurb}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-bark/10 pt-2.5 text-[11px] leading-relaxed text-charcoal-soft">
            Status comes straight from the task audit trail — &ldquo;working&rdquo; means a task is ready or running right now; nothing is simulated.
          </p>
        </Card>

        <Card className="lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-medium text-charcoal"><Activity size={15} className="text-forest" aria-hidden="true" /> Recent activity</h2>
            <Link href="/app/activity" className="text-xs font-medium text-forest hover:underline">View all activity →</Link>
          </div>
          {activityEvents.length === 0 ? (
            <p className="mt-3 text-sm text-charcoal-soft">
              No activity recorded yet. Every approval, publication, agent step and metric lands here with its evidence attached.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-bark/10">
              {activityEvents.map((e) => {
                const evidence = resolveActivityEvidence(e.meta);
                return (
                  <li key={e.id} className="flex items-start gap-2.5 py-2.5">
                    <span className="mt-0.5 shrink-0" aria-hidden="true">{ACTOR_ICON[e.actorType] ?? ACTOR_ICON.user}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${ACTOR_STYLE[e.actorType] ?? ACTOR_STYLE.user}`}>{ACTOR_LABEL[e.actorType] ?? ACTOR_LABEL.user}</span>
                        <span className="text-[11px] text-charcoal-soft/70">{timeAgo(e.createdAt, now)}</span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-charcoal">{e.summary}</span>
                    </span>
                    {evidence && (
                      <Link href={evidence.href} className="mt-0.5 shrink-0 text-[11px] font-medium text-forest hover:underline">
                        {evidence.label} ↗
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ————— 7. Recommended next test — the AI banner ————— */}
      {topRec ? (
        <div className="rooted-fig mt-6 flex flex-col gap-4 rounded-[3px] border border-fig/25 bg-gradient-to-r from-fig/[0.08] via-white to-forest/[0.06] p-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-3 lg:max-w-md">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fig/15 text-fig-deep">
              <Sparkles size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-charcoal">
                Recommended next test
                <Badge variant="warm">AI · evidence-backed</Badge>
              </p>
              <p className="mt-1 text-sm font-medium text-forest-deep">{topRec.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-charcoal-soft">{topRec.rationale}</p>
            </div>
          </div>
          <EvidenceList raw={topRec.evidence} uncertainty={topRec.uncertainty} />
          <div className="flex shrink-0 items-center lg:ml-auto">
            <LinkButton href={topRec.goalId ? `/app/goals/${topRec.goalId}` : "/app/strategy"} variant="primary" size="sm">
              Review plan <ArrowRight size={13} aria-hidden="true" />
            </LinkButton>
          </div>
        </div>
      ) : setupSuggestions.length > 0 ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {setupSuggestions.map((s) => (
            <Link key={s.href} href={s.href} className="card-lift rooted flex items-start gap-3 rounded-[3px] border border-bark/15 bg-white p-4">
              <ArrowRight className="mt-1 text-forest" size={16} aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-charcoal">{s.label}</span>
                <span className="mt-0.5 block text-xs text-charcoal-soft">{s.why}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {recommendations.length > 1 && (
        <p className="mt-3 text-xs text-charcoal-soft">
          <Lightbulb size={12} className="mr-1 inline text-fig" aria-hidden="true" />
          {recommendations.length - 1} more open recommendation{recommendations.length - 1 === 1 ? "" : "s"} on the{" "}
          <Link href="/app/strategy" className="font-medium text-forest hover:underline">strategy page</Link>.
        </p>
      )}

      {/* Blockers that are not in the active goal's focus still deserve a line. */}
      {blockedTasks.length > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-clay">
          <AlertTriangle size={12} aria-hidden="true" /> Blocked work appears in this week&apos;s focus with its actionable fix.
        </p>
      )}
    </>
  );
}

/** Agent-role status styling — derived from the AgentTask audit trail, not simulated. */
const AGENT_STATUS_STYLE: Record<AgentRoleStatus, { dot: string; text: string; label: string }> = {
  working: { dot: "bg-forest animate-pulse", text: "text-forest", label: "Working now" },
  awaiting: { dot: "bg-amber-500", text: "text-amber-700", label: "Awaiting your review" },
  blocked: { dot: "bg-clay", text: "text-clay", label: "Blocked" },
  queued: { dot: "bg-fig", text: "text-fig-deep", label: "Queued" },
  idle: { dot: "bg-sage", text: "text-charcoal-soft", label: "Idle" },
  offline: { dot: "bg-bark/30", text: "text-charcoal-soft/70", label: "No runs yet" },
};

/** Activity-feed actor presentation. actorType is one of user | system | ai. */
const ACTOR_LABEL: Record<string, string> = { user: "You", system: "System", ai: "Agent" };
const ACTOR_STYLE: Record<string, string> = { user: "text-forest", system: "text-charcoal-soft", ai: "text-fig" };
const ACTOR_ICON: Record<string, React.ReactNode> = {
  user: <CheckCircle2 size={12} className="text-forest" />,
  system: <Activity size={12} className="text-charcoal-soft" />,
  ai: <Bot size={12} className="text-fig" />,
};

/** Evidence checklist for the recommendation banner — renders only what is recorded. */
function EvidenceList({ raw, uncertainty }: { raw: string; uncertainty: string }) {
  let entries: { source?: string; summary?: string }[] = [];
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) entries = parsed.slice(0, 3) as { source?: string; summary?: string }[];
  } catch {
    entries = [];
  }
  if (entries.length === 0 && !uncertainty) return null;
  return (
    <div className="min-w-0 flex-1 border-t border-bark/10 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
      {entries.length > 0 && (
        <ul className="space-y-1.5">
          {entries.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-charcoal-soft">
              <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
              <span className="min-w-0">{e.summary || e.source || "Recorded evidence"}</span>
            </li>
          ))}
        </ul>
      )}
      {uncertainty && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] italic text-charcoal-soft/80">
          <Play size={10} className="mt-0.5 shrink-0" aria-hidden="true" /> Limits: {uncertainty}
        </p>
      )}
    </div>
  );
}
