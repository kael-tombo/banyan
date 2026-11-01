import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, LinkButton, StatusBadge } from "@/components/ui";
import { VisitsChart } from "@/components/VisitsChart";
import CommandChat, { type ChatMessageDTO } from "@/components/CommandChat";
import {
  computeAgentTeam, attributionCoverage, resolveActivityEvidence, timeAgo,
  AGENT_META, type AgentRoleStatus,
} from "@/lib/growth-loop";
import { AlertTriangle, ArrowRight, Check, FlaskConical, LineChart, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

/** Funnel stage definitions mirror the first-party events the app records. */
const FUNNEL_STAGES: { type: string; label: string; sub: string }[] = [
  { type: "visit", label: "Tracked visits", sub: "Clicks through your links" },
  { type: "signup", label: "Signups", sub: "Attributed arrivals" },
  { type: "onboarding_complete", label: "Activated", sub: "Completed onboarding" },
];

/** "1 signup", "3 signups". */
function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

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

/** A recorded-window comparison. Never invents a baseline: zero prior data is
 *  said plainly instead of being rendered as growth. */
function deltaNote(current: number, previous: number): string {
  if (current === 0) return previous === 0 ? "No events recorded yet" : "None in this window";
  if (previous === 0) return "First events in this window";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "Flat vs previous 14 days";
  return `${pct > 0 ? "+" : ""}${pct}% vs previous 14 days`;
}

/** The signature: a fig dot marks only what waits on a human. */
function FigDot() {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-fig" aria-hidden="true" />;
}

/** A cell in the numbers strip: label, figure, what it compares to. Nothing else. */
function Stat({
  href,
  label,
  value,
  note,
  waiting = false,
}: {
  href: string;
  label: string;
  value: number;
  note: string;
  waiting?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group border-bark/[0.08] p-5 transition-colors hover:bg-canvas/70 [&:nth-child(n+3)]:border-t lg:[&:nth-child(n+3)]:border-t-0 [&:not(:first-child)]:border-l [&:nth-child(3)]:border-l-0 lg:[&:nth-child(3)]:border-l"
    >
      <p className="flex items-center gap-2 text-[13px] text-charcoal-soft">
        {waiting && <FigDot />}
        {label}
      </p>
      <p className="num mt-3 font-serif text-[28px] leading-none text-forest-deep">{value.toLocaleString()}</p>
      <p className="mt-2 truncate text-xs leading-4 text-muted">{note}</p>
    </Link>
  );
}

/** A quiet text link with a trailing arrow, used for every "open more" link. */
function MoreLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 text-[13px] font-medium text-forest underline-offset-4 hover:underline ${className}`}
    >
      {children} <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );
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
    awaitingApprovalCount,
    awaitingGateCount,
    proposedStrategy,
    chatMessagesRaw,
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
    // Both comparison windows, so the main chart can lay one over the other.
    prisma.metricEvent.findMany({ where: { workspaceId: wid, type: "visit", createdAt: { gte: d28 } }, select: { createdAt: true } }),
    prisma.experiment.findFirst({ where: { workspaceId: wid, status: "running" }, orderBy: { updatedAt: "desc" } }),
    prisma.experiment.findFirst({ where: { workspaceId: wid }, orderBy: { updatedAt: "desc" } }),
    prisma.agentTask.findMany({ where: { workspaceId: wid }, orderBy: { updatedAt: "desc" }, take: 120, select: { agentRole: true, status: true, title: true, goalId: true, updatedAt: true } }),
    prisma.activityEvent.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, type: true, actorType: true, actorSummary: true, summary: true, meta: true, createdAt: true } }),
    prisma.metricEvent.count({ where: { workspaceId: wid, type: "signup", createdAt: { gte: d14 }, OR: [{ linkId: { not: null } }, { campaignId: { not: null } }] } }),
    // Exact counts for the human queue and its gates (the focus list is capped).
    prisma.contentItem.count({ where: { workspaceId: wid, status: "ready_for_review" } }),
    prisma.agentTask.count({ where: { workspaceId: wid, type: "approval_gate", status: "waiting_approval" } }),
    // A strategy proposal waiting on the founder (US-043).
    prisma.strategy.findFirst({ where: { workspaceId: wid, status: "proposed" }, orderBy: { version: "desc" }, select: { id: true, version: true, method: true } }),
    // Command center chat — last 30 turns of the persisted conversation.
    prisma.chatMessage.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  const activeGoal = goals.find((g) => g.status === "active") ?? goals[0] ?? null;
  const chatMessages: ChatMessageDTO[] = chatMessagesRaw.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    modelLabel: m.modelLabel,
    isFallback: m.isFallback,
    createdAt: m.createdAt.toISOString(),
  }));
  const goalTasks = activeGoal
    ? await prisma.agentTask.findMany({ where: { goalId: activeGoal.id }, orderBy: { createdAt: "asc" } })
    : [];
  const runningTasks = goalTasks.filter((t) => ["ready", "running"].includes(t.status));
  const awaitingTasks = goalTasks.filter((t) => t.status === "waiting_approval");

  // Rule-based setup suggestions remain for onboarding steps the agent cannot do for you.
  const setupSuggestions: { label: string; href: string; why: string }[] = [];
  if (!profile?.name) setupSuggestions.push({ label: "Complete your product profile", href: "/app/workspace", why: "The agents have nothing to ground plans and drafts in yet." });
  if (profile && goals.length === 0) setupSuggestions.push({ label: "Set your first goal", href: "/app/goals", why: "One sentence is enough. Banyan drafts the plan and asks before acting." });
  if (pendingApprovals.length > 0) setupSuggestions.push({ label: `Review ${plural(pendingApprovals.length, "item")} awaiting approval`, href: "/app/approvals", why: "Nothing can publish without your recorded approval." });

  // ————— Funnel: real counts + real 14-day deltas (never estimated) —————
  const countNow = (type: string) => funnelNow.find((f) => f.type === type)?._count ?? 0;
  const countPrev = (type: string) => funnelPrev.find((f) => f.type === type)?._count ?? 0;

  // Daily tracked-visit series for both windows — true zeros included.
  const bucket = (offsetDays: number) => {
    const days: Date[] = [];
    const map = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - (i + offsetDays) * DAY);
      days.push(d);
      map.set(d.toDateString(), 0);
    }
    for (const e of visitEvents) {
      const key = e.createdAt.toDateString();
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return { days, values: [...map.values()] };
  };
  const visitsNow = bucket(0);
  const visitsPrev = bucket(14);
  const totalVisits14 = visitsNow.values.reduce((a, b) => a + b, 0);
  const totalVisitsPrev = visitsPrev.values.reduce((a, b) => a + b, 0);

  // ————— This week's growth focus: the highest-leverage moves, in one list —————
  type FocusItem = { id: string; title: string; body: string; badge: React.ReactNode; cta: { href: string; label: string }; evidence?: string };
  const focus: FocusItem[] = [];
  if (proposedStrategy) {
    focus.push({
      id: proposedStrategy.id,
      title: `Review distribution strategy v${proposedStrategy.version}`,
      body: "Channels, cadence and KPIs drafted from your approved profile. Content is written only from a strategy you approve.",
      badge: <Badge variant="warm">Waiting on you</Badge>,
      cta: { href: "/app/strategy", label: "Review strategy" },
    });
  }
  for (const t of blockedTasks) {
    focus.push({
      id: t.id, title: t.title,
      body: t.lastError ? t.lastError.slice(0, 140) : `Blocked ${t.type.replace(/_/g, " ")} task. Fix it to unblock the workflow.`,
      badge: <StatusBadge status={t.status} />,
      cta: { href: t.goalId ? `/app/goals/${t.goalId}` : "/app/goals", label: "Open goal" },
    });
  }
  for (const c of pendingApprovals.slice(0, 2)) {
    focus.push({
      id: c.id, title: c.title,
      body: "Ready for your recorded approval. Nothing publishes without it.",
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

  // ————— The command bar's live numbers —————
  const waitingOnYou = awaitingApprovalCount + awaitingGateCount + (proposedStrategy ? 1 : 0);
  const completedTaskCount = goalTasks.filter((t) => t.status === "completed").length;
  const countableTaskCount = goalTasks.filter((t) => t.status !== "cancelled").length;
  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      {/* ————— Head ————— */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">{today}</p>
          <h1 className="mt-1 font-serif text-[30px] leading-[1.15] text-forest-deep">Command center</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-charcoal-soft">
            What to do next, the goal in motion and what the evidence says. Every figure comes from recorded events.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/app/experiments" variant="secondary">
            <FlaskConical size={16} aria-hidden="true" /> New experiment
          </LinkButton>
          <LinkButton href="/app/cycles/new">
            <RefreshCw size={16} aria-hidden="true" /> Start a cycle
          </LinkButton>
        </div>
      </div>

      {/* ————— 1. Next moves + the goal ————— */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="flex items-center gap-2 text-base font-medium text-charcoal">
              Next moves
              {waitingOnYou > 0 && (
                <span className="flex items-center gap-1.5 text-[13px] font-normal text-fig-deep">
                  <FigDot /> <span className="num">{waitingOnYou}</span> waiting on you
                </span>
              )}
            </h2>
            <p className="text-[13px] text-muted">Closest to the goal, in order</p>
          </div>

          {focusItems.length > 0 ? (
            <ol className="mt-4 divide-y divide-bark/[0.08]">
              {focusItems.map((item, i) => (
                <li key={item.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 py-4 first:pt-1 last:pb-0">
                  <span
                    className={`num mt-0.5 flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs ${
                      i === 0 ? "bg-forest-deep text-white" : "bg-canvas text-muted"
                    }`}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium leading-6 text-charcoal">{item.title}</p>
                      {item.badge}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-charcoal-soft">{item.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <MoreLink href={item.cta.href}>{item.cta.label}</MoreLink>
                      {item.evidence && <span className="text-xs text-muted">Evidence: {item.evidence}</span>}
                    </div>
                    {topRec && item.id === topRec.id && <EvidenceList raw={topRec.evidence} uncertainty={topRec.uncertainty} />}
                  </div>
                </li>
              ))}
            </ol>
          ) : setupSuggestions.length > 0 ? (
            <ul className="mt-4 divide-y divide-bark/[0.08]">
              {setupSuggestions.map((s) => (
                <li key={s.href} className="py-3 first:pt-1 last:pb-0">
                  <Link href={s.href} className="group flex items-start gap-3">
                    <ArrowRight className="mt-0.5 shrink-0 text-muted transition-colors group-hover:text-forest" size={16} aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-medium text-charcoal group-hover:text-forest">{s.label}</span>
                      <span className="mt-0.5 block text-[13px] text-charcoal-soft">{s.why}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-charcoal-soft">
              {activeGoal
                ? "The planner is drafting the next steps. Refresh in a moment."
                : "Nothing in motion yet. Start a cycle and this list fills with the workflow's next moves."}
            </p>
          )}

          {recommendations.length > 1 && (
            <p className="mt-5 border-t border-bark/[0.08] pt-4 text-[13px] text-charcoal-soft">
              {plural(recommendations.length - 1, "more open recommendation")} on the{" "}
              <Link href="/app/strategy" className="font-medium text-forest underline-offset-4 hover:underline">strategy page</Link>
            </p>
          )}
        </Card>

        {activeGoal ? (
          <Card className="flex flex-col lg:col-span-4">
            <p className="flex items-center gap-2 text-[13px] text-charcoal-soft">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  activeGoal.status === "awaiting_approval" ? "bg-fig" : activeGoal.status === "active" ? "bg-forest" : "bg-bark/30"
                }`}
                aria-hidden="true"
              />
              Goal in motion · <span className="capitalize">{activeGoal.status.replace(/_/g, " ")}</span>
            </p>
            <h2 className="mt-3 font-serif text-[20px] leading-[1.3] text-forest-deep">
              <Link href={`/app/goals/${activeGoal.id}`} className="underline-offset-4 hover:underline">
                {activeGoal.objective}
              </Link>
            </h2>
            <p className="mt-2 text-[13px] leading-5 text-muted">
              {activeGoal.successMetric.replace(/_/g, " ")}
              {activeGoal.metricTarget ? ` · target ${activeGoal.metricTarget.toLocaleString()}${activeGoal.metricUnit ? ` ${activeGoal.metricUnit}` : ""}` : ""}
              {activeGoal.deadline ? ` · by ${activeGoal.deadline.toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}
            </p>

            <div className="mt-auto pt-6">
              <div className="flex items-baseline justify-between gap-3">
                <span className="num font-mono text-xs text-muted">
                  {completedTaskCount.toLocaleString()} of {plural(countableTaskCount, "task")}
                </span>
                <span className="num text-sm font-medium text-forest-deep">{Math.round(activeGoal.progress)}%</span>
              </div>
              <div
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-forest/[0.1]"
                role="progressbar"
                aria-valuenow={activeGoal.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Goal task completion"
              >
                <div className="h-full rounded-full bg-forest" style={{ width: `${Math.min(100, activeGoal.progress)}%` }} />
              </div>
              <div className="mt-4 flex items-center gap-4 border-t border-bark/[0.08] pt-4">
                <MoreLink href={`/app/cycles/${activeGoal.id}`}>View cycle</MoreLink>
                <Link href="/app/strategy" className="text-[13px] text-charcoal-soft underline-offset-4 hover:text-forest hover:underline">
                  Strategy
                </Link>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="flex flex-col lg:col-span-4">
            <p className="text-[13px] text-muted">{goals.length === 0 ? "No cycle run yet" : "No goal in motion"}</p>
            <h2 className="mt-3 font-serif text-[20px] leading-tight text-forest-deep">
              {goals.length === 0 ? "Run the first complete cycle" : "Everything is resting"}
            </h2>
            <p className="mt-2 text-[13px] leading-5 text-charcoal-soft">
              Paste your product URL, correct the snapshot and approve one plan. You get three channel-native assets,
              publishing, measured results and a proposed next move. Nothing publishes without your approval.
            </p>
            <LinkButton href="/app/cycles/new" className="mt-auto self-start">
              Start a cycle <ArrowRight size={16} aria-hidden="true" />
            </LinkButton>
          </Card>
        )}
      </div>

      {/* ————— 2. The numbers, in one strip ————— */}
      <section aria-label="Key numbers" className="card-shadow mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-bark/10 bg-white lg:grid-cols-4">
        <Stat
          href="/app/approvals"
          label="Waiting on you"
          value={waitingOnYou}
          waiting={waitingOnYou > 0}
          note={waitingOnYou > 0 ? [awaitingApprovalCount ? plural(awaitingApprovalCount, "review") : "", awaitingGateCount ? plural(awaitingGateCount, "gate") : "", proposedStrategy ? "1 strategy" : ""].filter(Boolean).join(" · ") : "The queue is clear"}
        />
        <Stat
          href="/app/activity"
          label="Tasks in motion"
          value={runningTasks.length}
          note={runningTasks.length > 0 ? "Ready or running now" : "No task is running"}
        />
        <Stat href="/app/analytics" label="Tracked visits · 14 days" value={countNow("visit")} note={deltaNote(countNow("visit"), countPrev("visit"))} />
        <Stat href="/app/analytics" label="Signups · 14 days" value={countNow("signup")} note={deltaNote(countNow("signup"), countPrev("signup"))} />
      </section>

      {/* ————— 3. Customer journey + Ask Banyan ————— */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 className="text-base font-medium text-charcoal">Customer journey</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-4 rounded-full bg-forest" aria-hidden="true" />
                Last 14 days · <span className="num font-mono text-charcoal">{totalVisits14.toLocaleString()}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="w-4 border-t-[1.5px] border-dashed border-bark/40" aria-hidden="true" />
                Previous 14 days · <span className="num font-mono">{totalVisitsPrev.toLocaleString()}</span>
              </span>
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-3 text-[13px] text-charcoal-soft">Tracked visits per day</p>
            {totalVisits14 + totalVisitsPrev > 0 ? (
              <VisitsChart current={visitsNow.values} previous={visitsPrev.values} days={visitsNow.days} />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl bg-canvas px-6 text-center">
                <LineChart size={18} className="text-muted" aria-hidden="true" />
                <p className="max-w-sm text-[13px] leading-5 text-muted">
                  No tracked visits in the last 28 days. Tracked links record them once content goes out.
                </p>
              </div>
            )}
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-bark/[0.08] pt-5">
            {FUNNEL_STAGES.map((stage, i) => {
              const cur = countNow(stage.type);
              return (
                <div key={stage.type} className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-[13px] text-charcoal-soft">
                    {i > 0 && <ArrowRight size={12} className="shrink-0 text-muted" aria-hidden="true" />}
                    <span className="truncate">{stage.label}</span>
                  </dt>
                  <dd className="mt-1.5">
                    <span className="num font-serif text-[24px] leading-none text-forest-deep">{cur.toLocaleString()}</span>
                    <span className="mt-1 block truncate text-xs text-muted" title={stage.sub}>{stage.sub}</span>
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-bark/[0.08] pt-4">
            <p className="text-[13px] text-charcoal-soft">
              Attribution coverage{" "}
              {coverage != null ? (
                <>
                  <span className="num font-medium text-charcoal">{coverage}%</span>
                  <span className="text-muted"> of {plural(countNow("signup"), "signup")} traced to a tracked source</span>
                </>
              ) : (
                <span className="text-muted">· not enough data yet</span>
              )}
              {trackedClicks > 0 && (
                <span className="text-muted"> · {plural(trackedClicks, "click")} across {plural(linksAgg._count, "tracked link")}</span>
              )}
            </p>
            <MoreLink href="/app/analytics">View details</MoreLink>
          </div>
          {coverage != null && coverage < 100 && (
            <p className="mt-2 flex items-start gap-2 text-[13px] leading-5 text-clay">
              <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
              <span>
                {plural(countNow("signup") - attributedSignups, "signup")} without a tracked source. UTM-tagged links close
                the gap (<Link href="/app/connections" className="underline hover:text-charcoal">data quality</Link>)
              </span>
            </p>
          )}
        </Card>

        <div className="lg:col-span-4">
          <CommandChat initialMessages={chatMessages} compact />
        </div>
      </div>

      {/* ————— 4. Publishing · experiment · agents ————— */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-medium text-charcoal">Publishing</h2>
            <span className="flex items-center gap-2 text-[13px] text-charcoal-soft">
              <span className={`h-1.5 w-1.5 rounded-full ${connectionsLive.length > 0 ? "bg-forest" : "bg-bark/30"}`} aria-hidden="true" />
              {connectionsLive.length > 0 ? "Connected" : "Export mode"}
            </span>
          </div>
          {connectionsLive.length > 0 && (
            <p className="mt-1 truncate font-mono text-xs text-muted">
              {connectionsLive.map((c) => `${c.label || c.channel} · ${c.adapter}`).join(" · ")}
            </p>
          )}
          {scheduled.length + published.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {scheduled.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <Link href={`/app/content/${p.contentItemId}`} className="block truncate text-sm text-charcoal hover:text-forest">{p.contentItem.title}</Link>
                    <span className="text-xs text-muted">{p.scheduledFor ? fmtDate(p.scheduledFor) : "Unscheduled"} · {p.contentItem.channel}</span>
                  </span>
                  <StatusBadge status={p.status} />
                </li>
              ))}
              {published.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <Link href={`/app/content/${p.contentItemId}`} className="block truncate text-sm text-charcoal hover:text-forest">{p.contentItem.title}</Link>
                    <span className="text-xs text-muted">Published {p.publishedAt ? fmtDate(p.publishedAt) : ""}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted">{p.manual ? "manual" : p.provider}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] leading-5 text-charcoal-soft">
              Nothing scheduled or published yet. Approved posts appear here with their real status.
            </p>
          )}
          <MoreLink href="/app/calendar" className="mt-auto pt-5">Publishing calendar</MoreLink>
        </Card>

        <Card className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-medium text-charcoal">Experiment</h2>
            {experiment ? (
              <span className="flex items-center gap-2 text-[13px] text-charcoal-soft">
                <span className="h-1.5 w-1.5 rounded-full bg-forest" aria-hidden="true" />
                Running · day <span className="num">{experimentDay}</span>
              </span>
            ) : latestExperiment ? (
              <StatusBadge status={latestExperiment.status} />
            ) : null}
          </div>
          {experiment ? (
            <>
              <p className="mt-3 text-sm font-medium leading-5 text-charcoal">{experiment.title}</p>
              <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-charcoal-soft">{experiment.hypothesis}</p>
              <dl className="mt-4 space-y-1.5 text-[13px]">
                <div className="flex justify-between gap-3"><dt className="text-muted">Variable</dt><dd className="truncate text-charcoal">{experiment.variable}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Success metric</dt><dd className="truncate text-charcoal">{experiment.successMetric}</dd></div>
              </dl>
            </>
          ) : latestExperiment ? (
            <>
              <p className="mt-3 line-clamp-2 text-sm font-medium leading-5 text-charcoal">{latestExperiment.title}</p>
              {latestExperiment.interpretation && (
                <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-charcoal-soft">{latestExperiment.interpretation}</p>
              )}
              <p className="mt-3 text-[13px] text-muted">None running. Start the next one from what was learned.</p>
            </>
          ) : (
            <p className="mt-3 text-[13px] leading-5 text-charcoal-soft">No experiments yet. One variable at a time, with a success metric declared up front.</p>
          )}
          <MoreLink href="/app/experiments" className="mt-auto pt-5">Experiments</MoreLink>
        </Card>

        <Card className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-medium text-charcoal">Agent team</h2>
            <span className="text-[13px] text-muted">
              <span className="num">{agentTeam.filter((a) => a.status === "working").length}</span> working
            </span>
          </div>
          <ul className="mt-3 divide-y divide-bark/[0.06]">
            {agentTeam.map((a) => {
              const style = AGENT_STATUS_STYLE[a.status];
              return (
                <li key={a.role} className="flex items-center gap-2.5 py-2">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                  <Link href={a.href} className="min-w-0 flex-1 truncate text-[13px] text-charcoal hover:text-forest" title={a.latestAction ?? AGENT_META[a.role].blurb}>
                    {AGENT_META[a.role].name.replace(/ Agent$/, "")}
                  </Link>
                  <span className={`shrink-0 text-xs ${style.text}`}>{style.label}</span>
                  {a.at && <span className="shrink-0 whitespace-nowrap text-right font-mono text-xs text-muted">{timeAgo(a.at, now)}</span>}
                </li>
              );
            })}
          </ul>
          <MoreLink href="/app/activity" className="mt-auto pt-4">Agent activity</MoreLink>
        </Card>
      </div>

      {/* ————— 5. Recent activity ————— */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium text-charcoal">Recent activity</h2>
          <MoreLink href="/app/activity">All activity</MoreLink>
        </div>
        {activityEvents.length === 0 ? (
          <p className="mt-4 text-sm text-charcoal-soft">
            No activity recorded yet. Every approval, publication, agent step and metric lands here with its evidence attached.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-bark/[0.08]">
            {activityEvents.slice(0, 6).map((e) => {
              const evidence = resolveActivityEvidence(e.meta);
              return (
                <li key={e.id} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-baseline gap-x-4 py-2.5 sm:grid-cols-[56px_96px_minmax(0,1fr)_auto]">
                  <span className="text-[13px] font-medium text-charcoal">{ACTOR_LABEL[e.actorType] ?? ACTOR_LABEL.user}</span>
                  <span className="hidden whitespace-nowrap font-mono text-xs text-muted sm:block">{timeAgo(e.createdAt, now)}</span>
                  <span className="truncate text-[13px] leading-5 text-charcoal-soft" title={e.summary}>{e.summary}</span>
                  {evidence ? (
                    <Link href={evidence.href} className="text-[13px] font-medium text-forest underline-offset-4 hover:underline">
                      {evidence.label}
                    </Link>
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

/** Agent-role status styling — derived from the AgentTask audit trail, not simulated.
 *  Fig is reserved for "awaiting your review": the only state that waits on a human. */
const AGENT_STATUS_STYLE: Record<AgentRoleStatus, { dot: string; text: string; label: string }> = {
  working: { dot: "bg-forest", text: "text-forest", label: "Working now" },
  awaiting: { dot: "bg-fig", text: "text-fig-deep", label: "Awaiting your review" },
  blocked: { dot: "bg-clay", text: "text-clay", label: "Blocked" },
  queued: { dot: "bg-moss/50", text: "text-charcoal-soft", label: "Queued" },
  idle: { dot: "bg-bark/30", text: "text-muted", label: "Idle" },
  offline: { dot: "border border-bark/30 bg-transparent", text: "text-muted", label: "No runs yet" },
};

/** Activity-feed actor presentation. actorType is one of user | system | ai. */
const ACTOR_LABEL: Record<string, string> = { user: "You", system: "System", ai: "Agent" };

/** Evidence checklist for the recommendation — renders only what is recorded. */
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
    <div className="mt-3 rounded-lg bg-canvas px-3 py-2.5">
      {entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-5 text-charcoal-soft">
              <Check size={14} className="mt-[3px] shrink-0 text-forest" aria-hidden="true" />
              <span className="min-w-0">{e.summary || e.source || "Recorded evidence"}</span>
            </li>
          ))}
        </ul>
      )}
      {uncertainty && (
        <p className="mt-2 text-xs leading-4 text-muted">
          <span className="font-medium text-charcoal-soft">Limits</span> · {uncertainty}
        </p>
      )}
    </div>
  );
}
