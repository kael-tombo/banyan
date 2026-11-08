import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { PublicationState } from "@/components/PublicationState";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, Circle, Clock3, Loader2,
  RefreshCw, ShieldCheck, Sparkles, Video,
} from "lucide-react";
import GoalLive from "@/app/app/goals/[id]/goal-live";
import GateActions from "@/app/app/goals/[id]/gate-actions";
import CycleRetry from "./cycle-retry";
import { isManualChannel, postLabel } from "@/lib/formats";
import { nextStep } from "@/lib/cycle/next-step";
import { parseChannelConstraint } from "@/lib/agents/channels";

export const metadata: Metadata = { title: "Cycle" };
export const dynamic = "force-dynamic";

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Plan and strategy states in words ("planned" alone read as "Plan planned"). */
const PLAN_WORDS: Record<string, string> = { planned: "Waiting for you", proposed: "Waiting for you", approved: "Approved", rejected: "Rejected", draft: "Being drafted" };

type StageState = "done" | "waiting" | "active" | "blocked" | "pending";

const STAGE_STATE: Record<StageState, { node: string; text: string }> = {
  done: { node: "border-forest bg-forest text-ivory", text: "text-forest-deep" },
  waiting: { node: "border-fig bg-fig/[0.12] text-fig-deep", text: "text-fig-deep" },
  active: { node: "border-forest bg-white text-forest", text: "text-forest-deep" },
  blocked: { node: "border-clay bg-clay/[0.08] text-clay", text: "text-clay" },
  pending: { node: "border-bark/15 bg-white text-muted", text: "text-muted" },
};

function StageIcon({ state }: { state: StageState }) {
  if (state === "done") return <CheckCircle2 size={13} aria-hidden="true" />;
  if (state === "waiting") return <Clock3 size={13} aria-hidden="true" />;
  if (state === "active") return <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />;
  if (state === "blocked") return <AlertTriangle size={13} aria-hidden="true" />;
  return <Circle size={12} aria-hidden="true" />;
}

function channelLabel(channel: string): string {
  if (channel === "x") return "X";
  if (channel === "linkedin") return "LinkedIn";
  if (channel === "shortvideo") return "Short-form video";
  return channel;
}

function Section({
  title,
  hint,
  action,
  children,
  id,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <Card className="mt-4 scroll-mt-6" id={id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl tracking-[-0.01em] text-forest-deep">{title}</h2>
          {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-xl border border-bark/10 bg-ivory/40 p-3">
      <p className="num font-serif text-2xl leading-none text-forest-deep">{value}</p>
      <p className="mt-1 text-[12px] font-semibold text-charcoal">{label}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-charcoal-soft">{note}</p>
    </div>
  );
}

export default async function CyclePage({ params, searchParams }: { params: Promise<{ goalId: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { goalId } = await params;
  const { welcome } = await searchParams;
  const ctx = await requireWorkspaceServer();

  const goal = await prisma.goal.findFirst({
    where: { id: goalId, workspaceId: ctx.workspace.id },
    include: {
      plan: { include: { approvedBy: { select: { name: true } } } },
      tasks: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, type: true, title: true, status: true, agentRole: true,
          lastError: true, updatedAt: true,
        },
      },
      campaigns: {
        orderBy: { createdAt: "asc" },
        include: {
          items: {
            orderBy: { createdAt: "asc" },
            include: { publications: { orderBy: { createdAt: "desc" } } },
          },
        },
      },
      recommendations: { where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!goal) notFound();

  // A cycle that runs on the launch path has a strategy instead of a GoalPlan (docs/DECISION_ONE_CYCLE_PIPELINE.md).
  const strategy = goal.plan
    ? null
    : await prisma.strategy.findFirst({ where: { goalId: goal.id, workspaceId: ctx.workspace.id }, orderBy: { version: "desc" }, select: { id: true, version: true, status: true, approvedAt: true } });
  const campaignIds = goal.campaigns.map((c) => c.id);
  const content = goal.campaigns.flatMap((c) => c.items);
  const publications = content.flatMap((item) => item.publications);
  const contentById = new Map(content.map((item) => [item.id, item]));

  const links = campaignIds.length
    ? await prisma.trackedLink.findMany({
        where: { workspaceId: ctx.workspace.id, campaignId: { in: campaignIds } },
        select: { id: true, slug: true, clicks: true, targetUrl: true, contentItemId: true },
      })
    : [];
  const linkIds = links.map((l) => l.id);
  const events = linkIds.length
    ? await prisma.metricEvent.groupBy({
        by: ["type"],
        where: { workspaceId: ctx.workspace.id, linkId: { in: linkIds } },
        _count: { _all: true },
      })
    : [];

  const linkByContent = new Map<string, (typeof links)[number]>();
  for (const link of links) {
    if (link.contentItemId) linkByContent.set(link.contentItemId, link);
  }

  const clicks = links.reduce((sum, link) => sum + link.clicks, 0);
  const signups = events.find((e) => e.type === "signup")?._count._all ?? 0;
  const providerPublications = publications
    .filter((p) => p.status === "published" && !p.manual)
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  const manualRecords = publications.filter((p) => p.status === "published" && p.manual);
  const manualContent = content.filter((item) => isManualChannel(item.channel));

  const pendingReview = content.filter((c) => ["draft", "ready_for_review", "rejected"].includes(c.status));
  const approvedContent = content.filter((c) => ["approved", "scheduled", "published"].includes(c.status));
  const gateTask = goal.tasks.find((t) => t.type === "approval_gate" && t.status === "waiting_approval") ?? null;
  const blockedTasks = goal.tasks.filter((t) => t.status === "blocked" || t.status === "failed");
  const hasOpenWork = goal.tasks.some((t) => ["pending", "ready", "running"].includes(t.status));

  const assumptions = parseJSON<string[]>(goal.plan?.assumptions, []);
  const missingInfo = parseJSON<string[]>(goal.plan?.missingInfo, []);
  const risks = parseJSON<string[]>(goal.plan?.risks, []);
  const phases = parseJSON<{ name: string; description: string }[]>(goal.plan?.phases, []);
  const planMeta = parseJSON<{ label?: string; isFallback?: boolean }>(goal.plan?.generatedMeta, {});

  const recommendation = goal.recommendations[0] ?? null;
  const evidence = parseJSON<{ source?: string; ref?: string; summary?: string }[]>(
    recommendation?.evidence,
    []
  );

  const selectedChannels = parseChannelConstraint(goal.constraints);

  const stageLabel = (state: StageState) => ({ done: "Done", waiting: "Needs you", active: "In progress", blocked: "Blocked", pending: "Later" })[state];

  const stages: { key: string; label: string; state: StageState; hint: string }[] = [
    { key: "intake", label: "Product", state: "done", hint: "Profile reviewed" },
    {
      key: "strategy",
      label: goal.plan ? "Plan" : "Strategy",
      state: goal.plan
        ? goal.plan.status === "approved" ? "done" : "waiting"
        : strategy
          ? strategy.status === "approved" ? "done" : strategy.status === "proposed" ? "waiting" : "pending"
          : hasOpenWork ? "active" : "pending",
      hint: goal.plan ? PLAN_WORDS[goal.plan.status] ?? goal.plan.status : strategy ? `v${strategy.version} ${PLAN_WORDS[strategy.status] ?? strategy.status}`.trim() : hasOpenWork ? "Being drafted" : "Not started",
    },
    { key: "drafts", label: "Three posts", state: content.length >= 3 ? "done" : content.length > 0 ? "active" : "pending", hint: content.length > 0 ? `${content.length} of 3 drafted` : "After the strategy" },
    {
      key: "approval",
      label: "Your approval",
      state: gateTask || pendingReview.length > 0 ? "waiting" : approvedContent.length > 0 ? "done" : "pending",
      hint: pendingReview.length > 0 ? `${pendingReview.length} to review` : gateTask ? "Ready to publish" : approvedContent.length > 0 ? `${approvedContent.length} approved` : "After the drafts",
    },
    {
      key: "publish",
      label: "Publishing",
      state: providerPublications.length > 0 ? "done" : blockedTasks.some((t) => t.type === "publish") ? "blocked" : approvedContent.length > 0 ? "active" : "pending",
      hint: providerPublications.length > 0 ? `${providerPublications.length} live` : blockedTasks.some((t) => t.type === "publish") ? "Needs a channel" : "After approval",
    },
    {
      key: "measure",
      label: "Results",
      state: goal.tasks.find((t) => t.type === "measure")?.status === "completed" ? "done" : providerPublications.length > 0 ? "active" : "pending",
      hint: links.length > 0 ? `${clicks} click${clicks === 1 ? "" : "s"}` : "After a live post",
    },
    { key: "next", label: "Next move", state: recommendation ? "done" : "pending", hint: recommendation ? "Proposed" : "After results" },
  ];

  const publishBlocked = blockedTasks.some((t) => t.type === "publish");
  const manualPending = manualContent.filter((item) => !manualRecords.some((p) => p.contentItemId === item.id));
  const step = nextStep({
    goalStatus: goal.status,
    planStatus: goal.plan?.status ?? null,
    strategyStatus: strategy?.status ?? null,
    drafts: content.length,
    pendingReview: pendingReview.length,
    gateWaiting: Boolean(gateTask),
    approved: approvedContent.length,
    published: providerPublications.length,
    publishBlocked,
    otherBlocked: blockedTasks.filter((t) => t.type !== "publish").length,
    hasOpenWork,
    manualPending: manualPending.length,
    firstManualId: manualPending[0]?.id ?? null,
    clicks,
    trackedLinks: links.length,
    hasRecommendation: Boolean(recommendation),
  });
  const STEP_TONE: Record<typeof step.who, { ring: string; label: string; chip: string }> = {
    you: { ring: "border-forest/30", label: "Your move", chip: "bg-forest text-ivory" },
    banyan: { ring: "border-bark/12", label: "Banyan is on it", chip: "bg-sage/60 text-forest-deep" },
    blocked: { ring: "border-clay/30", label: "Blocked", chip: "bg-clay text-ivory" },
    done: { ring: "border-bark/12", label: "Finished", chip: "bg-bark/10 text-charcoal-soft" },
  };
  const tone = STEP_TONE[step.who];

  // Chapters still to come, in one quiet list instead of a column of empty cards.
  const later: { label: string; hint: string }[] = [];
  if (content.length === 0) later.push({ label: "Three posts", hint: "One LinkedIn post, one X post and one short video script, written from the approved strategy." });
  if (providerPublications.length === 0 && manualContent.length === 0 && !publishBlocked) later.push({ label: "Publishing", hint: "Only posts you approved, and only once each channel confirms them live." });
  if (links.length === 0) later.push({ label: "Results", hint: "Clicks and signups from Banyan's tracked links, once a post is live. No estimates." });
  if (!recommendation) later.push({ label: "Next move", hint: "A proposal built on what this cycle measured, never on an empty result." });

  const angle = goal.description.trim();
  const meta = [
    goal.metricTarget != null ? `${goal.metricTarget.toLocaleString()} ${goal.successMetric}` : goal.successMetric,
    goal.deadline ? `by ${goal.deadline.toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : null,
    ...selectedChannels.map(channelLabel),
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        eyebrow="Your cycle"
        title={goal.objective}
        actions={
          <>
            <LinkButton href={`/app/cycles/${goal.id}/report`} variant="ghost" size="sm">Report</LinkButton>
            <LinkButton href={`/app/goals/${goal.id}`} variant="ghost" size="sm">Execution record</LinkButton>
            <StatusBadge status={goal.status} />
          </>
        }
      />

      <div className="-mt-2 mb-5 flex flex-wrap items-center gap-1.5">
        {meta.map((m) => (
          <span key={m} className="rounded-md bg-bark/[0.06] px-2 py-0.5 text-[12px] text-charcoal-soft">{m}</span>
        ))}
        {angle && (
          <span className="min-w-0 max-w-full truncate rounded-md bg-sage/45 px-2 py-0.5 text-[12px] text-forest-deep" title={angle}>
            Angle: {angle}
          </span>
        )}
      </div>

      {welcome === "1" && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-sage bg-mist/70 px-5 py-4" role="status">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
          <div>
            <p className="text-[14px] font-medium text-forest-deep">Your first cycle has started.</p>
            <p className="mt-0.5 text-[13px] leading-5 text-charcoal-soft">
              Banyan drafts; you decide. Whatever needs you next always appears in the card below, and nothing is published without your approval.
            </p>
          </div>
        </div>
      )}

      {/* The one thing that matters next. */}
      <section aria-label="Next step" className={`card-shadow rounded-2xl border-2 bg-white p-6 ${tone.ring}`}>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone.chip}`}>
          {step.who === "banyan" ? <Loader2 size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : step.who === "blocked" ? <AlertTriangle size={11} aria-hidden="true" /> : <Sparkles size={11} aria-hidden="true" />}
          {tone.label}
        </span>
        <h2 className="mt-3 font-serif text-[26px] leading-tight tracking-[-0.015em] text-forest-deep">{step.title}</h2>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-charcoal-soft">{step.body}</p>
        {step.action && "href" in step.action && (
          <div className="mt-4">
            <LinkButton href={step.action.href} className="h-10 rounded-xl px-4">
              {step.action.label} <ArrowRight size={15} aria-hidden="true" />
            </LinkButton>
          </div>
        )}
        {step.action && "gate" in step.action && gateTask && (
          <div className="mt-4">
            <GateActions taskId={gateTask.id} />
          </div>
        )}
      </section>

      {/* Where the cycle is: seven stops on one line. */}
      <ol aria-label="Cycle stages" className="mt-6 grid grid-cols-1 gap-y-3 sm:grid-cols-7 sm:gap-x-2">
        {stages.map((stage, i) => {
          const s = STAGE_STATE[stage.state];
          return (
            <li key={stage.key} className="flex items-start gap-3 sm:flex-col sm:gap-2">
              <div className="flex shrink-0 items-center sm:w-full">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${s.node}`} aria-hidden="true">
                  <StageIcon state={stage.state} />
                </span>
                {i < stages.length - 1 && <span className={`ml-2 hidden h-0.5 flex-1 rounded-full sm:block ${stage.state === "done" ? "bg-forest/50" : "bg-bark/12"}`} aria-hidden="true" />}
              </div>
              <div className="min-w-0">
                <p className={`text-[13px] font-medium ${s.text}`}>{stage.label}</p>
                <p className="text-[12px] leading-snug text-muted">
                  <span className="sr-only">{stageLabel(stage.state)}: </span>
                  {stage.hint}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-6">
        <GoalLive goalId={goal.id} initial={{ status: goal.status, progress: goal.progress }} hasOpenWork={hasOpenWork} />
      </div>

      <Section id="plan" title={goal.plan ? "The plan" : "The strategy"} hint={goal.plan?.status === "approved" || strategy?.status === "approved" ? "Approved; everything is written from it" : "Nothing executes before your approval"} action={planMeta.isFallback ? <Badge variant="warm">template fallback</Badge> : undefined}>
        {goal.plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={goal.plan.status === "approved" ? "forest" : goal.plan.status === "rejected" ? "clay" : "warm"}>{goal.plan.status}</Badge>
              {goal.plan.approvedAt && goal.plan.approvedBy?.name && <span className="text-[12px] text-muted">approved by {goal.plan.approvedBy.name}</span>}
              {phases.length > 0 && <span className="text-[12px] text-charcoal-soft">{phases.map((p) => p.name).join(" → ")}</span>}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-charcoal">{goal.plan.summary}</p>
            {(assumptions.length > 0 || missingInfo.length > 0 || risks.length > 0) && (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                {assumptions.length > 0 && (
                  <div className="rounded-xl border border-bark/10 bg-ivory/40 p-3">
                    <p className="text-[12px] font-medium text-charcoal-soft">Assumptions to check, not facts</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-charcoal-soft">{assumptions.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                )}
                {missingInfo.length > 0 && (
                  <div className="rounded-xl border border-fig/25 bg-fig/[0.06] p-3">
                    <p className="text-[12px] font-medium text-fig-deep">Missing information</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-charcoal-soft">{missingInfo.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                )}
                {risks.length > 0 && (
                  <div className="rounded-xl border border-bark/10 p-3">
                    <p className="text-[12px] font-medium text-charcoal-soft">Risks</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-charcoal-soft">{risks.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
            {goal.plan.status === "rejected" && goal.plan.rejectedReason && <p className="mt-3 text-xs leading-relaxed text-clay">Rejected: {goal.plan.rejectedReason}</p>}
          </>
        ) : strategy ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm leading-relaxed text-charcoal">
              Strategy <span className="font-medium">v{strategy.version}</span>: channels, angles, cadence and KPIs.{" "}
              {strategy.status === "approved" ? "Approved; the posts are written from it." : strategy.status === "proposed" ? "It waits for your review." : `It was ${strategy.status}.`}
            </p>
            <LinkButton href="/app/strategy" variant={strategy.status === "proposed" ? "primary" : "secondary"} size="sm">{strategy.status === "proposed" ? "Review strategy" : "Open strategy"}</LinkButton>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-charcoal-soft">Banyan is drafting it from your product and objective. It waits here for your approval before anything is written or published.</p>
        )}
      </Section>

      {content.length > 0 && (
        <Section title="The three posts" hint={`${content.length} of 3 drafted · approval is recorded per post`} action={pendingReview.length > 0 ? <LinkButton href="/app/approvals" variant="secondary" size="sm">Review {pendingReview.length}</LinkButton> : undefined}>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {content.map((item) => {
              const pub = item.publications[0];
              const link = linkByContent.get(item.id);
              const needsYou = ["ready_for_review", "rejected", "draft"].includes(item.status);
              return (
                <li key={item.id} className={`flex flex-col gap-2 rounded-xl border p-4 ${needsYou ? "border-forest/25 bg-white" : "border-bark/10 bg-ivory/30"}`}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="charcoal">{channelLabel(item.channel)}</Badge>
                    <StatusBadge status={item.status} />
                    {isManualChannel(item.channel) && <Badge variant="warm">you post it</Badge>}
                  </div>
                  <Link href={`/app/content/${item.id}`} className="font-medium leading-snug text-forest-deep hover:underline">{postLabel(item).name}</Link>
                  {item.body && <p className="line-clamp-3 text-[13px] leading-5 text-charcoal-soft">{item.body}</p>}
                  {pub && <PublicationState publication={pub} compact />}
                  {item.rejectionReason && item.status === "rejected" && <p className="text-xs leading-relaxed text-clay">Reason: {item.rejectionReason}</p>}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[12px]">
                    <span className="text-muted">{link ? `${link.clicks} click${link.clicks === 1 ? "" : "s"}` : item.format}</span>
                    <Link href={`/app/content/${item.id}`} className="inline-flex items-center gap-1 font-medium text-forest hover:underline">
                      {needsYou ? "Review" : "Open"} <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {(providerPublications.length > 0 || manualContent.length > 0 || publishBlocked) && (
        <Section title="Publishing" hint="Provider-confirmed only: a post counts once its channel confirms it live">
          {providerPublications.length > 0 && (
            <ul className="divide-y divide-bark/10">
              {providerPublications.map((pub) => {
                const item = contentById.get(pub.contentItemId);
                return (
                  <li key={pub.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-charcoal">{item ? postLabel(item).name : "Post"}</p>
                      <p className="mt-0.5 text-xs text-charcoal-soft">{channelLabel(item?.channel ?? "")} · confirmed {pub.publishedAt ? pub.publishedAt.toLocaleString() : "by the provider"}</p>
                    </div>
                    {pub.externalUrl ? (
                      <a href={pub.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-forest hover:underline">View live post <ArrowUpRight size={12} aria-hidden="true" /></a>
                    ) : (
                      <span className="text-xs text-charcoal-soft">No public URL returned</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {manualContent.length > 0 && (
            <div className={`${providerPublications.length > 0 ? "mt-4" : ""} rounded-xl border border-bark/12 bg-ivory/50 p-3`}>
              <p className="flex items-center gap-1.5 text-sm font-medium text-charcoal"><Video size={15} className="text-forest" aria-hidden="true" /> Short video: you record and post it</p>
              <p className="mt-1 text-xs leading-relaxed text-charcoal-soft">Banyan wrote the script but can&apos;t record or upload video. Post it, then attach the live link so this cycle can count it.</p>
              <ul className="mt-2 space-y-1.5">
                {manualContent.map((item) => {
                  const recorded = manualRecords.find((p) => p.contentItemId === item.id);
                  return (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <Link href={`/app/content/${item.id}`} className="font-medium text-forest-deep hover:underline">{item.title}</Link>
                      <span className="text-charcoal-soft">{recorded ? "recorded" : "script ready, not posted yet"}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3"><LinkButton href="/app/publishing" variant="secondary" size="sm">Record the live link</LinkButton></div>
            </div>
          )}
          {publishBlocked && (
            <div className="mt-4 rounded-xl border border-clay/20 bg-clay/[0.04] p-3">
              <p className="text-sm font-medium text-clay">Publishing is blocked</p>
              <p className="mt-1 text-xs leading-relaxed text-charcoal-soft">A live channel needs a verified connection, or you can post natively and record the link. Nothing is lost.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <LinkButton href="/app/publishing" size="sm">Open Publishing</LinkButton>
                <LinkButton href="/app/connections" variant="secondary" size="sm">Connections</LinkButton>
              </div>
            </div>
          )}
        </Section>
      )}

      {links.length > 0 && (
        <Section title="Results" hint="First-party records, not modelling">
          <div className="grid gap-2 sm:grid-cols-3">
            <Stat label="Tracked links" value={links.length} note="Created when a live post is confirmed" />
            <Stat label="Clicks" value={clicks} note="Recorded by Banyan's /t links" />
            <Stat label="Signups attributed" value={signups} note="First-party signup events tied to those links" />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-charcoal-soft">
            {clicks === 0 ? "The links exist and recorded zero clicks so far: a measured zero, not missing data." : "These are recorded events. Banyan doesn't estimate impressions or engagement it can't read."}
            {manualRecords.length > 0 && " Manual posts have no tracked link, so they add no clicks here."}
          </p>
          <div className="mt-3"><LinkButton href="/app/analytics" variant="secondary" size="sm">Open analytics</LinkButton></div>
        </Section>
      )}

      {blockedTasks.length > 0 && (
        <Section id="blocking" title="What's blocking this cycle" hint="Fix the cause, then retry; the state is kept">
          <ul className="space-y-2">
            {blockedTasks.slice(0, 4).map((task) => (
              <li key={task.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-bark/10 bg-ivory/40 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-charcoal">{task.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-charcoal-soft">{task.lastError ?? `The ${task.type.replace(/_/g, " ")} step is ${task.status}.`}</p>
                </div>
                <CycleRetry taskId={task.id} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recommendation && (
        <Section title="The next move" hint="Built only on what this cycle measured">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="forest">{recommendation.confidence} confidence</Badge>
            <span className="text-xs text-charcoal-soft">proposed by {recommendation.producedBy.replace("agent:", "")}</span>
          </div>
          <h3 className="mt-2 font-serif text-lg text-forest-deep">{recommendation.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-charcoal">{recommendation.rationale}</p>
          {recommendation.uncertainty && <p className="mt-2 text-xs leading-relaxed text-charcoal-soft">What would change this: {recommendation.uncertainty}</p>}
          {evidence.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {evidence.slice(0, 4).map((item, i) => (
                <li key={`${item.ref ?? item.source ?? "evidence"}-${i}`} className="rounded-lg border border-bark/10 bg-ivory/40 px-2.5 py-2 text-xs text-charcoal-soft">{item.summary ?? item.ref ?? item.source ?? "Recorded evidence"}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <LinkButton href="/app/cycles/new"><RefreshCw size={14} aria-hidden="true" /> Start the next cycle</LinkButton>
            <LinkButton href="/app/strategy" variant="secondary">Strategy</LinkButton>
          </div>
        </Section>
      )}

      {later.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg text-forest-deep">Later in this cycle</h2>
          <ul className="mt-3 divide-y divide-bark/10">
            {later.map((l) => (
              <li key={l.label} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
                <span className="w-32 shrink-0 text-[13px] font-medium text-charcoal-soft">{l.label}</span>
                <span className="text-[13px] leading-5 text-muted">{l.hint}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-charcoal-soft">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} className="text-forest" aria-hidden="true" /> Level 1: Banyan proposes, you approve, Banyan executes.</span>
        <Link href="/app/activity" className="font-medium text-forest hover:underline">Full audit trail →</Link>
      </div>
    </>
  );
}
