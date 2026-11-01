import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, Circle, Clock3, Loader2,
  RefreshCw, ShieldCheck, Sparkles, Video,
} from "lucide-react";
import GoalLive from "@/app/app/goals/[id]/goal-live";
import GateActions from "@/app/app/goals/[id]/gate-actions";
import CycleRetry from "./cycle-retry";
import { isManualChannel } from "@/lib/formats";
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

type StageState = "done" | "waiting" | "active" | "blocked" | "pending";

const STAGE_STATE: Record<StageState, { card: string; dot: string; text: string }> = {
  done: { card: "border-forest/20 bg-forest/[0.045]", dot: "bg-forest", text: "text-forest" },
  waiting: { card: "border-amber-500/25 bg-amber-50/60", dot: "bg-amber-500", text: "text-amber-700" },
  active: { card: "border-forest/25 bg-white", dot: "bg-forest animate-pulse", text: "text-forest-deep" },
  blocked: { card: "border-clay/25 bg-clay/[0.05]", dot: "bg-clay", text: "text-clay" },
  pending: { card: "border-bark/10 bg-white/70", dot: "bg-sage", text: "text-charcoal-soft" },
};

function StageIcon({ state }: { state: StageState }) {
  if (state === "done") return <CheckCircle2 size={13} aria-hidden="true" />;
  if (state === "waiting") return <Clock3 size={13} aria-hidden="true" />;
  if (state === "active") return <Loader2 size={13} className="animate-spin" aria-hidden="true" />;
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
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl tracking-[-0.01em] text-forest-deep">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-charcoal-soft">{hint}</p>}
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

export default async function CyclePage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
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

  const stages: { key: string; label: string; state: StageState; hint: string }[] = [
    { key: "intake", label: "Intake", state: "done", hint: "Product snapshot reviewed" },
    {
      key: "strategy",
      label: "Strategy",
      state: goal.plan ? (goal.plan.status === "approved" ? "done" : "waiting") : "pending",
      hint: goal.plan ? `Plan ${goal.plan.status}` : "Planner is drafting",
    },
    {
      key: "drafts",
      label: "Three assets",
      state: content.length >= 3 ? "done" : content.length > 0 ? "active" : "pending",
      hint: content.length > 0 ? `${content.length} of 3 drafted` : "After the plan",
    },
    {
      key: "approval",
      label: "Approval",
      state: gateTask || pendingReview.length > 0 ? "waiting" : approvedContent.length > 0 ? "done" : "pending",
      hint: gateTask
        ? "Gate waiting on you"
        : pendingReview.length > 0
          ? `${pendingReview.length} need review`
          : approvedContent.length > 0
            ? "Recorded per item"
            : "Not started",
    },
    {
      key: "publish",
      label: "Publishing",
      state: providerPublications.length > 0 ? "done" : blockedTasks.some((t) => t.type === "publish") ? "blocked" : approvedContent.length > 0 ? "active" : "pending",
      hint: providerPublications.length > 0
        ? `${providerPublications.length} live`
        : blockedTasks.some((t) => t.type === "publish")
          ? "Needs a channel"
          : "After approval",
    },
    {
      key: "measure",
      label: "Measurement",
      state: goal.tasks.find((t) => t.type === "measure")?.status === "completed" ? "done" : providerPublications.length > 0 ? "active" : "pending",
      hint: links.length > 0 ? `${clicks} click(s) recorded` : "Awaiting a live post",
    },
    {
      key: "next",
      label: "Next move",
      state: recommendation ? "done" : "pending",
      hint: recommendation ? "Proposed from records" : "After measurement",
    },
  ];

  const headerDescription = [
    goal.successMetric + (goal.metricTarget != null ? ` · target ${goal.metricTarget.toLocaleString()}` : ""),
    goal.deadline ? `by ${goal.deadline.toLocaleDateString()}` : "no deadline",
    selectedChannels.length > 0 ? selectedChannels.map(channelLabel).join(", ") : "channels not fixed",
  ].join(" · ");

  return (
    <>
      <PageHeader
        eyebrow="Complete cycle"
        title={goal.objective}
        description={headerDescription}
        actions={
          <>
            <LinkButton href={`/app/goals/${goal.id}`} variant="ghost" size="sm">
              Execution view
            </LinkButton>
            <LinkButton href={`/app/cycles/${goal.id}/report`} variant="ghost" size="sm">
              Cycle report
            </LinkButton>
            {pendingReview.length > 0 && (
              <LinkButton href="/app/approvals" variant="secondary" size="sm">
                Review {pendingReview.length}
              </LinkButton>
            )}
            <StatusBadge status={goal.status} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {selectedChannels.map((channel) => (
          <Badge key={channel} variant="charcoal">
            {channelLabel(channel)}
            {isManualChannel(channel) ? " · manual handoff" : " · live publish"}
          </Badge>
        ))}
        {goal.plan?.approvedAt && (
          <Badge variant="forest">
            plan approved{goal.plan.approvedBy?.name ? ` by ${goal.plan.approvedBy.name}` : ""}
          </Badge>
        )}
        <Badge variant="warm">{Math.round(goal.progress)}% executed</Badge>
      </div>

      <GoalLive
        goalId={goal.id}
        initial={{ status: goal.status, progress: goal.progress }}
        hasOpenWork={hasOpenWork}
      />

      <section aria-label="Cycle stages" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {stages.map((stage, i) => {
          const style = STAGE_STATE[stage.state];
          return (
            <div key={stage.key} className={`rounded-xl border p-3 ${style.card}`}>
              <div className="flex items-center justify-between gap-1">
                <span className={`flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] ${style.text}`}>
                  <StageIcon state={stage.state} /> {stage.label}
                </span>
                <span className="text-[10px] text-charcoal-soft/60">{i + 1}/7</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-charcoal-soft">{stage.hint}</p>
            </div>
          );
        })}
      </section>

      <Section
        title="The plan"
        hint={goal.plan?.status === "approved" ? "Approved — execution may proceed" : "Nothing executes before your approval"}
        action={
          planMeta.isFallback ? <Badge variant="warm">template fallback</Badge> : undefined
        }
      >
        {goal.plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={goal.plan.status === "approved" ? "forest" : goal.plan.status === "rejected" ? "clay" : "warm"}>
                {goal.plan.status}
              </Badge>
              {phases.length > 0 && (
                <span className="text-xs text-charcoal-soft">
                  {phases.length} phase{phases.length === 1 ? "" : "s"}: {phases.map((p) => p.name).join(" → ")}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-charcoal">{goal.plan.summary}</p>

            {assumptions.length > 0 && (
              <div className="mt-3 rounded-xl border border-bark/10 bg-ivory/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-charcoal-soft">
                  Assumptions to validate — not facts
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-charcoal-soft">
                  {assumptions.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            {missingInfo.length > 0 && (
              <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-50/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-amber-700">
                  Missing information
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-amber-800">
                  {missingInfo.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            {risks.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-charcoal-soft">Risks</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-charcoal-soft">
                  {risks.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            {goal.plan.status === "rejected" && goal.plan.rejectedReason && (
              <p className="mt-3 text-xs leading-relaxed text-clay">
                Rejected: {goal.plan.rejectedReason}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm leading-relaxed text-charcoal-soft">
            No plan yet. The planner drafts it from the product snapshot and objective; it is stored here for your
            approval before any consequential task is created.
          </p>
        )}
      </Section>

      <Section
        title="The three assets"
        hint={`${content.length} of 3 drafted · approval is recorded per item`}
        action={
          pendingReview.length > 0 ? (
            <LinkButton href="/app/approvals" variant="secondary" size="sm">
              Open approvals
            </LinkButton>
          ) : undefined
        }
      >
        {content.length === 0 ? (
          <p className="text-sm leading-relaxed text-charcoal-soft">
            Assets appear after the plan is approved: one X post, one LinkedIn post, and one short-form video script.
            Banyan does not draft a batch of 100 posts to look busy.
          </p>
        ) : (
          <ul className="divide-y divide-bark/10">
            {content.map((item) => {
              const pub = item.publications[0];
              const link = linkByContent.get(item.id);
              return (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/app/content/${item.id}`} className="font-medium text-forest-deep hover:underline">
                        {item.title}
                      </Link>
                      <Badge variant="charcoal">{channelLabel(item.channel)}</Badge>
                      <StatusBadge status={item.status} />
                      {isManualChannel(item.channel) && <Badge variant="warm">manual handoff</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-charcoal-soft">
                      {item.format} · {pub ? pub.status.replace(/_/g, " ") : "not published"}
                      {link ? ` · ${link.clicks} tracked click(s)` : ""}
                    </p>
                    {item.rejectionReason && item.status === "rejected" && (
                      <p className="mt-1 text-xs leading-relaxed text-clay">Reason: {item.rejectionReason}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {pub?.externalUrl && (
                      <a
                        href={pub.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-forest hover:underline"
                      >
                        Live post <ArrowUpRight size={12} aria-hidden="true" />
                      </a>
                    )}
                    <Link
                      href={`/app/content/${item.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-forest hover:underline"
                    >
                      {["ready_for_review", "rejected"].includes(item.status) ? "Review" : "Open"}
                      <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {gateTask && (
          <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-50/50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
              <ShieldCheck size={15} aria-hidden="true" /> Execution gate waiting on your decision
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800/80">
              Review every draft above, then close the gate. The server re-verifies that no draft is left unreviewed;
              this button cannot approve content for you.
            </p>
            <div className="mt-2"><GateActions taskId={gateTask.id} /></div>
          </div>
        )}
      </Section>

      <Section title="Publishing" hint="provider-confirmed publications only">
        {providerPublications.length > 0 ? (
          <ul className="divide-y divide-bark/10">
            {providerPublications.map((pub) => {
              const item = contentById.get(pub.contentItemId);
              return (
                <li key={pub.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-charcoal">{item?.title ?? "Content item"}</p>
                    <p className="mt-0.5 text-xs text-charcoal-soft">
                      {channelLabel(item?.channel ?? "")} · confirmed {pub.publishedAt ? pub.publishedAt.toLocaleString() : "by the provider"}
                    </p>
                  </div>
                  {pub.externalUrl ? (
                    <a
                      href={pub.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-forest hover:underline"
                    >
                      View live post <ArrowUpRight size={12} aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="text-xs text-charcoal-soft">No public URL returned</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed text-charcoal-soft">
            Nothing has been confirmed as published. Banyan never marks a post live because it scheduled an attempt —
            this section only lists provider-confirmed publications.
          </p>
        )}

        {manualContent.length > 0 && (
          <div className="mt-4 rounded-xl border border-bark/12 bg-ivory/50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-charcoal">
              <Video size={15} className="text-forest" aria-hidden="true" /> Manual handoff: short-form video
            </p>
            <p className="mt-1 text-xs leading-relaxed text-charcoal-soft">
              Banyan wrote the script, but it cannot record or upload video. Record it yourself, post it, then attach
              the live URL in Publishing. This cycle does not count the video as a live publish.
            </p>
            <ul className="mt-2 space-y-1.5">
              {manualContent.map((item) => {
                const recorded = manualRecords.find((p) => p.contentItemId === item.id);
                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <Link href={`/app/content/${item.id}`} className="font-medium text-forest-deep hover:underline">
                      {item.title}
                    </Link>
                    <span className="text-charcoal-soft">
                      {recorded ? "recorded manually" : "script prepared — not recorded yet"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3">
              <LinkButton href="/app/publishing" variant="secondary" size="sm">
                Record a manual publication
              </LinkButton>
            </div>
          </div>
        )}

        {blockedTasks.some((t) => t.type === "publish") && (
          <div className="mt-4 rounded-xl border border-clay/20 bg-clay/[0.04] p-3">
            <p className="text-sm font-semibold text-clay">Publishing is blocked</p>
            <p className="mt-1 text-xs leading-relaxed text-charcoal-soft">
              A live channel needs a verified connection, or you can publish natively and record the URL as a manual
              publication. The workflow state is preserved.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <LinkButton href="/app/publishing" size="sm">Open Publishing</LinkButton>
              <LinkButton href="/app/connections" variant="secondary" size="sm">Connections</LinkButton>
            </div>
          </div>
        )}
      </Section>

      <Section title="What happened" hint="first-party records, not modelling">
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat
            label="Tracked links"
            value={links.length}
            note={links.length > 0 ? "Created when a live post is confirmed" : "None yet — no link, no click claim"}
          />
          <Stat
            label="Clicks"
            value={clicks}
            note={links.length > 0 ? "Recorded by Banyan's /t links" : "No tracked link exists yet"}
          />
          <Stat
            label="Signups attributed"
            value={signups}
            note={links.length > 0 ? "First-party signup events tied to those links" : "No attribution path yet"}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-charcoal-soft">
          {links.length === 0
            ? "A zero here is the absence of measurement, not a measured zero. Nothing has published through a channel Banyan can measure."
            : clicks === 0
              ? "The links exist and recorded zero clicks. That is a measured zero — not missing data."
              : "These are recorded events. Banyan does not estimate impressions or engagement it cannot read."}
          {manualRecords.length > 0 && " Manual publications are recorded, but they have no first-party tracked link, so they contribute no clicks here."}
        </p>
        <div className="mt-3">
          <LinkButton href="/app/analytics" variant="secondary" size="sm">Open analytics</LinkButton>
        </div>
      </Section>

      {blockedTasks.length > 0 && (
        <Section title="What is blocking this cycle" hint="Retry after fixing the cause — state is preserved">
          <ul className="space-y-2">
            {blockedTasks.slice(0, 4).map((task) => (
              <li key={task.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-bark/10 bg-ivory/40 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-charcoal">{task.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-charcoal-soft">
                    {task.lastError ?? `The ${task.type.replace(/_/g, " ")} task is ${task.status}.`}
                  </p>
                </div>
                <CycleRetry taskId={task.id} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="The next move" hint="Only from measured evidence">
        {recommendation ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="forest">{recommendation.confidence} confidence</Badge>
              <span className="text-xs text-charcoal-soft">proposed by {recommendation.producedBy}</span>
            </div>
            <h3 className="mt-2 font-serif text-lg text-forest-deep">{recommendation.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-charcoal">{recommendation.rationale}</p>
            {recommendation.uncertainty && (
              <p className="mt-2 text-xs leading-relaxed text-charcoal-soft">
                Uncertainty: {recommendation.uncertainty}
              </p>
            )}
            {evidence.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {evidence.slice(0, 4).map((item, i) => (
                  <li key={`${item.ref ?? item.source ?? "evidence"}-${i}`} className="rounded-lg border border-bark/10 bg-ivory/40 px-2.5 py-2 text-xs text-charcoal-soft">
                    {item.summary ?? item.ref ?? item.source ?? "Recorded evidence"}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <LinkButton href="/app/cycles/new">
                <RefreshCw size={14} aria-hidden="true" /> Start the next cycle
              </LinkButton>
              <LinkButton href="/app/strategy" variant="secondary">Strategy</LinkButton>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-charcoal-soft">
              No next move has been proposed. Banyan proposes one only after a cycle produces measured evidence; it will
              not invent a recommendation from an empty result.
            </p>
            {providerPublications.length === 0 && (
              <p className="mt-2 text-xs leading-relaxed text-charcoal-soft">
                This cycle has not published through a live channel yet, so there is nothing to learn from.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <LinkButton href="/app/cycles/new" variant="secondary">
                <RefreshCw size={14} aria-hidden="true" /> Start another cycle
              </LinkButton>
              <LinkButton href={`/app/goals/${goal.id}`} variant="ghost">See the execution record</LinkButton>
            </div>
          </>
        )}
      </Section>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-charcoal-soft">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles size={12} className="text-fig" aria-hidden="true" /> Level 1: Banyan proposes, you approve, Banyan executes.
        </span>
        <Link href="/app/activity" className="font-medium text-forest hover:underline">Full audit trail →</Link>
      </div>
    </>
  );
}
