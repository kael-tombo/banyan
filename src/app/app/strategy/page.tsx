import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, EmptyState, PageHeader, StatusBadge, LinkButton } from "@/components/ui";
import {
  ArrowRight, CheckCircle2, FileCheck2, Flag, FlaskConical, Lightbulb,
  ListChecks, Sparkles, TriangleAlert,
} from "lucide-react";

import { strategyView } from "@/lib/strategy/service";
import { diffStrategies, pickCurrent } from "@/lib/strategy/review";
import type { StrategyBody } from "@/lib/strategy/generate";
import { approvalState } from "@/lib/product/profile-review";
import { canApprove } from "@/lib/permissions";
import { StrategyReview } from "./strategy-review";

export const dynamic = "force-dynamic";
export const metadata = { title: "Growth strategy" };

const DAY = 24 * 60 * 60 * 1000;

function timeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / 3_600_000)} h ago`;
  return `${Math.floor(ms / DAY)} d ago`;
}

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseEvidence(raw: string): { source?: string; summary?: string }[] {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as { source?: string; summary?: string }[]) : [];
  } catch {
    return [];
  }
}

const CONFIDENCE_VARIANT = { high: "forest", medium: "warm", low: "warm" } as const;

export default async function GrowthStrategyPage() {
  const ctx = await requireWorkspaceServer();
  const wid = ctx.workspace.id;

  const [goals, recommendations, strategyTasks, experiments] = await Promise.all([
    prisma.goal.findMany({
      where: { workspaceId: wid, status: { in: ["planning", "awaiting_approval", "active", "paused"] } },
      orderBy: { updatedAt: "desc" },
      take: 3,
      include: { plan: true },
    }),
    prisma.recommendation.findMany({ where: { workspaceId: wid, status: "open" }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.agentTask.findMany({
      where: { workspaceId: wid, agentRole: { in: ["planner", "strategist", "analyst"] } },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.experiment.findMany({ where: { workspaceId: wid }, select: { status: true, createdAt: true } }),
  ]);

  // ————— Distribution strategy (US-042/043) —————
  const strategies = await prisma.strategy.findMany({ where: { workspaceId: wid }, orderBy: { version: "desc" }, take: 12 });
  const current = pickCurrent(strategies);
  const currentView = current ? await strategyView(current) : null;
  const previous = current ? strategies.find((x) => x.version < current.version) : null;
  const strategyChanges = current && previous ? diffStrategies(JSON.parse(previous.body) as StrategyBody, JSON.parse(current.body) as StrategyBody) : [];
  const profileGate = { exists: Boolean(ctx.profile), needsApproval: approvalState(ctx.profile).needsApproval };
  const agentRun = await prisma.agentTask.findFirst({
    where: { workspaceId: wid, type: { in: ["autopilot_strategy", "autopilot_drafts"] }, status: { in: ["running", "failed"] } },
    orderBy: { updatedAt: "desc" },
    select: { type: true, status: true, title: true, lastError: true, updatedAt: true },
  });
  // A failed run is shown only while it is recent; an old failure is noise.
  const agentWork = agentRun && (agentRun.status === "running" || Date.now() - agentRun.updatedAt.getTime() < 15 * 60_000)
    ? { kind: agentRun.type === "autopilot_strategy" ? ("strategy" as const) : ("drafts" as const), running: agentRun.status === "running", title: agentRun.title, error: agentRun.lastError }
    : null;

  const activeGoal = goals.find((g) => g.status === "active") ?? goals[0] ?? null;
  const plan = activeGoal?.plan ?? null;
  const planMeta = plan ? (JSON.parse(plan.generatedMeta || "{}") as { label?: string; isFallback?: boolean }) : null;

  const constraints = (activeGoal?.constraints ?? "")
    .split(/[;,·]+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 4);

  const tasksPlanned = strategyTasks.length;
  const experimentsRun = experiments.length;
  const confidenceRank = { high: 3, medium: 2, low: 1 } as const;
  const overallConfidence = recommendations.reduce<"low" | "medium" | "high" | null>((acc, r) => {
    const c = r.confidence as "low" | "medium" | "high";
    if (!acc || confidenceRank[c] > confidenceRank[acc]) return c;
    return acc;
  }, null);

  const agentBusy = strategyTasks.some((t) => ["ready", "running", "pending"].includes(t.status));
  const risks = parseList(plan?.risks);
  const assumptions = parseList(plan?.assumptions);
  const missingInfo = parseList(plan?.missingInfo);

  return (
    <>
      <PageHeader
        title="Growth strategy"
        description="Choose the next growth bets with the strongest evidence and manageable effort. Every bet is explainable: it cites the recorded data behind it and states what would prove it wrong."
        actions={
          activeGoal ? (
            <LinkButton href={`/app/goals/${activeGoal.id}`} variant="secondary">
              Open execution view <ArrowRight size={14} aria-hidden="true" />
            </LinkButton>
          ) : (
            <LinkButton href="/app/goals" variant="secondary">Create a goal</LinkButton>
          )
        }
      />

      <StrategyReview
        initial={currentView}
        versions={strategies.map((x) => ({ id: x.id, version: x.version, status: x.status, method: x.method, createdAt: x.createdAt.toISOString() }))}
        changes={strategyChanges}
        profile={profileGate}
        canApprove={canApprove(ctx.membership.role)}
        agentWork={agentWork}
      />

      {/* ————— Goal & constraints ————— */}
      {activeGoal ? (
        <Card className="rooted">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest/10 text-forest">
                <Flag size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-soft">Goal</p>
                <p className="mt-0.5 font-medium text-charcoal">{activeGoal.objective}</p>
                <p className="mt-0.5 text-xs text-charcoal-soft">
                  {activeGoal.successMetric}
                  {activeGoal.metricTarget != null ? ` · target ${activeGoal.metricTarget.toLocaleString()}` : ""}
                  {activeGoal.deadline ? ` · by ${activeGoal.deadline.toLocaleDateString([], { month: "short", day: "numeric" })}` : " · no deadline"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-charcoal-soft">Constraints</span>
              {constraints.length > 0 ? (
                constraints.map((c) => (
                  <Badge key={c} variant="charcoal">{c}</Badge>
                ))
              ) : (
                <Badge variant="warm">none recorded</Badge>
              )}
              <StatusBadge status={activeGoal.status} />
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="No active goal to strategize around"
          body="A strategy needs a target. State your goal in plain language and the planner will draft the route — this page then synthesizes the bets worth making."
          icon={<Flag size={22} className="text-forest" />}
          action={<LinkButton href="/app/goals">Create your first goal</LinkButton>}
        />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* ————— Main column ————— */}
        <div className="lg:col-span-2">
          {/* Agent synthesis */}
          <Card>
            <h2 className="flex items-center gap-2 font-medium text-charcoal">
              <Sparkles size={16} className="text-fig" aria-hidden="true" /> Agent synthesis
            </h2>
            {plan?.summary ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-charcoal">{plan.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-bark/10 pt-3 text-xs text-charcoal-soft">
                  <span className="flex items-center gap-1.5"><ListChecks size={12} className="text-forest" aria-hidden="true" /> {tasksPlanned} planning task{tasksPlanned === 1 ? "" : "s"} run</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-forest" aria-hidden="true" /> {recommendations.length} open recommendation{recommendations.length === 1 ? "" : "s"}</span>
                  <span className="flex items-center gap-1.5"><FlaskConical size={12} className="text-forest" aria-hidden="true" /> {experimentsRun} experiment{experimentsRun === 1 ? "" : "s"} recorded</span>
                  {overallConfidence && (
                    <span className="flex items-center gap-1.5">
                      Confidence:
                      <Badge variant={CONFIDENCE_VARIANT[overallConfidence]}>{overallConfidence}</Badge>
                    </span>
                  )}
                </div>
                {planMeta?.label && (
                  <p className="mt-2 text-[11px] text-charcoal-soft/80">
                    Synthesized by {planMeta.label}{plan.approvedAt ? ` · plan approved ${plan.approvedAt.toLocaleDateString()}` : ""}.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-charcoal-soft">
                No synthesis yet. The strategist writes it after the plan is drafted and evidence is gathered —
                it will appear here with the counts behind it.
              </p>
            )}
          </Card>

          {/* Recommended growth bets */}
          <h2 className="mt-8 font-medium text-charcoal">Recommended growth bets</h2>
          {recommendations.length === 0 ? (
            <p className="mt-2 text-sm text-charcoal-soft">
              No open bets. Recommendations are produced by the evaluator after real outcomes are measured — they are never invented to fill a queue.
            </p>
          ) : (
            <ol className="mt-3 space-y-3">
              {recommendations.map((r, i) => {
                const evidence = parseEvidence(r.evidence);
                return (
                  <li key={r.id} className="card-lift flex flex-col gap-3 rounded-lg border border-bark/15 bg-white p-4 sm:flex-row sm:items-start">
                    <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage/50 text-xs font-semibold text-forest-deep sm:flex" aria-hidden="true">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-charcoal">{r.title}</p>
                        <Badge variant={CONFIDENCE_VARIANT[r.confidence as keyof typeof CONFIDENCE_VARIANT] ?? "warm"}>{r.confidence} confidence</Badge>
                        <Badge variant="charcoal">{r.producedBy.replace("agent:", "")}</Badge>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-charcoal-soft">{r.rationale}</p>
                      {evidence.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {evidence.slice(0, 2).map((e, j) => (
                            <li key={j} className="flex items-start gap-1.5 text-[11px] text-charcoal-soft/85">
                              <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
                              <span className="min-w-0">{e.summary || e.source}</span>
                            </li>
                          ))}
                          {evidence.length > 2 && <li className="text-[11px] text-charcoal-soft/70">+{evidence.length - 2} more evidence entr{evidence.length - 2 === 1 ? "y" : "ies"} recorded</li>}
                        </ul>
                      )}
                      {r.uncertainty && (
                        <p className="mt-2 text-[11px] italic text-charcoal-soft/80">What would disconfirm it: {r.uncertainty}</p>
                      )}
                      <div className="mt-2.5 flex flex-wrap items-center gap-3">
                        <LinkButton href={`/app/experiments?title=${encodeURIComponent(r.title)}`} size="sm">
                          <FlaskConical size={13} aria-hidden="true" /> Create experiment
                        </LinkButton>
                        {r.goalId && (
                          <Link href={`/app/goals/${r.goalId}`} className="text-xs font-medium text-forest hover:underline">View goal →</Link>
                        )}
                        <span className="text-[11px] text-charcoal-soft/70">{timeAgo(r.createdAt)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {/* Risks & assumptions to resolve */}
          <div className="mt-8">
            <h2 className="font-medium text-charcoal">Risks &amp; assumptions to resolve</h2>
            {!plan ? (
              <p className="mt-2 text-sm text-charcoal-soft">
                {activeGoal ? "The planner records risks and assumptions while drafting the plan — they will surface here for validation." : "Risks appear once a goal has an approved plan."}
              </p>
            ) : risks.length === 0 && assumptions.length === 0 && missingInfo.length === 0 ? (
              <p className="mt-2 text-sm text-charcoal-soft">The plan recorded no open risks, assumptions, or missing information (a true zero).</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {risks.map((risk, i) => (
                  <li key={`risk-${i}`} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-bark/15 bg-white p-3.5">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <TriangleAlert size={15} className="mt-0.5 shrink-0 text-fig" aria-hidden="true" />
                      <p className="min-w-0 text-sm text-charcoal">{risk}</p>
                    </div>
                    <Link href={`/app/experiments?title=${encodeURIComponent(`Validate: ${risk}`)}`} className="shrink-0 text-xs font-medium text-forest hover:underline">
                      Validate →
                    </Link>
                  </li>
                ))}
                {assumptions.map((a, i) => (
                  <li key={`assumption-${i}`} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-bark/15 bg-white p-3.5">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <Lightbulb size={15} className="mt-0.5 shrink-0 text-bark/60" aria-hidden="true" />
                      <p className="min-w-0 text-sm text-charcoal"><span className="text-charcoal-soft">Assumption:</span> {a}</p>
                    </div>
                    <Link href={`/app/experiments?title=${encodeURIComponent(`Validate: ${a}`)}`} className="shrink-0 text-xs font-medium text-forest hover:underline">
                      Validate →
                    </Link>
                  </li>
                ))}
                {missingInfo.map((m, i) => (
                  <li key={`missing-${i}`} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-dashed border-bark/25 bg-ivory p-3.5">
                    <p className="min-w-0 text-sm text-charcoal-soft"><span className="font-medium text-bark">Missing information:</span> {m}</p>
                    <Link href={`/app/context`} className="shrink-0 text-xs font-medium text-forest hover:underline">Record it →</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ————— Right rail: the strategist at work ————— */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-medium text-charcoal"><Sparkles size={15} className="text-fig" aria-hidden="true" /> Strategy agent</h2>
              <Badge variant={agentBusy ? "forest" : "warm"}>
                <span className={`h-1.5 w-1.5 rounded-full ${agentBusy ? "bg-forest" : "bg-bark/40"}`} aria-hidden="true" />
                {agentBusy ? "Working" : "Idle"}
              </Badge>
            </div>
            {strategyTasks.length === 0 ? (
              <p className="mt-2 text-sm text-charcoal-soft">No planning or analysis tasks yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {strategyTasks.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-charcoal">{t.title}</p>
                      <p className="text-[11px] text-charcoal-soft/75">{t.agentRole} · {timeAgo(t.updatedAt)}</p>
                    </div>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="rounded-lg border border-forest/20 bg-forest/[0.05] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-forest-deep">
              <CheckCircle2 size={15} className="text-forest" aria-hidden="true" /> Recommendations are explainable
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-charcoal-soft">
              Each bet cites its recorded evidence, carries the agent&apos;s confidence rating, and states what would
              disconfirm it. Confidence is a judgment — never presented as a measured outcome.
            </p>
          </div>

          {/* From opportunity to experiment */}
          <Card>
            <h2 className="font-medium text-charcoal">From opportunity to experiment</h2>
            <ol className="mt-3 space-y-0">
              {[
                { icon: Lightbulb, title: "Opportunity", body: "Surfaced from audience research, business context, and recorded outcomes." },
                { icon: FileCheck2, title: "Hypothesis", body: "Turned into a testable statement with a pre-declared success metric." },
                { icon: FlaskConical, title: "Experiment", body: "Launched one variable at a time; conclusions drafted from real data." },
              ].map((step, i, arr) => (
                <li key={step.title} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < arr.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-1.6rem)] w-px bg-bark/15" aria-hidden="true" />}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage/40 text-forest-deep">
                    <step.icon size={14} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 pt-1">
                    <p className="text-sm font-medium text-charcoal">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-charcoal-soft">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
