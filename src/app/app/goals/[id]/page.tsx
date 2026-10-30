import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, PageHeader, StatusBadge } from "@/components/ui";
import {
  buildDescent, buildLearningRings,
  type LearningRing, type RingSource,
} from "@/lib/goal-descent";
import { AlertTriangle, FileCheck2, FlaskConical, Lightbulb, ShieldCheck } from "lucide-react";
import GoalLive from "./goal-live";
import GateActions from "./gate-actions";
import ProvenanceBadge from "./provenance-badge";

export const dynamic = "force-dynamic";

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspaceServer();
  const goal = await prisma.goal.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { plan: { include: { approvedBy: { select: { name: true } } } } },
  });
  if (!goal) notFound();

  const tasks = await prisma.agentTask.findMany({ where: { goalId: id }, orderBy: { createdAt: "asc" } });
  const recommendations = await prisma.recommendation.findMany({ where: { goalId: id }, orderBy: { createdAt: "desc" } });
  const runs = await prisma.taskRun.findMany({
    where: { task: { goalId: id } },
    orderBy: { startedAt: "desc" },
    take: 8,
    include: { task: { select: { title: true, type: true } } },
  });
  const campaigns = await prisma.campaign.findMany({ where: { goalId: id }, select: { id: true, name: true, status: true } });

  // The loop's kept learning + its live stage counts — all from recorded rows.
  const [gatePasses, goalExperiments] = await Promise.all([
    prisma.agentTask.findMany({
      where: { goalId: id, type: "approval_gate", status: "completed" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, title: true, completedAt: true, updatedAt: true },
    }),
    prisma.experiment.findMany({
      where: { campaign: { goalId: id }, status: "complete" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, title: true, status: true, decidedAt: true, updatedAt: true, interpretation: true },
    }),
  ]);

  const ringSource: RingSource = {
    plan: goal.plan
      ? { approvedAt: goal.plan.approvedAt, approvedByName: goal.plan.approvedBy?.name ?? null }
      : null,
    gatePasses,
    experiments: goalExperiments,
    recommendations: recommendations.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      confidence: r.confidence,
      updatedAt: r.updatedAt,
    })),
  };
  const rings: LearningRing[] = buildLearningRings(ringSource);

  const descent = buildDescent({
    planStatus: goal.plan?.status ?? null,
    runningTasks: tasks.filter((t) => ["ready", "running"].includes(t.status)).length,
    queuedTasks: tasks.filter((t) => t.status === "pending").length,
    waitingGates: tasks.filter((t) => t.status === "waiting_approval" && t.type === "approval_gate").length,
    completedTasks: tasks.filter((t) => t.status === "completed").length,
    openRecommendations: recommendations.filter((r) => r.status === "open").length,
    concludedExperiments: goalExperiments.length,
  });

  const planMeta = goal.plan ? (JSON.parse(goal.plan.generatedMeta || "{}") as { label?: string; isFallback?: boolean }) : null;
  const parsed = (arr: string) => (Array.isArray(JSON.parse(arr || "[]")) ? (JSON.parse(arr) as string[]) : []);
  const phases = goal.plan ? (Array.isArray(JSON.parse(goal.plan.phases || "[]")) ? (JSON.parse(goal.plan.phases) as { name: string; description: string }[]) : []) : [];

  const awaiting = tasks.filter((t) => t.status === "waiting_approval");
  const blockers = tasks.filter((t) => t.status === "blocked" || t.status === "failed");
  const active = tasks.filter((t) => ["ready", "running"].includes(t.status));

  const STAGE_STYLE: Record<string, { dot: string; text: string; pulse?: boolean }> = {
    empty: { dot: "bg-sage", text: "text-charcoal-soft" },
    waiting: { dot: "bg-amber-500", text: "text-amber-700" },
    moving: { dot: "bg-forest", text: "text-forest", pulse: true },
    done: { dot: "bg-forest-deep", text: "text-forest-deep" },
  };

  const RING_ICON = {
    plan_approved: <FileCheck2 size={13} className="text-forest" aria-hidden="true" />,
    gate_passed: <ShieldCheck size={13} className="text-forest" aria-hidden="true" />,
    experiment_concluded: <FlaskConical size={13} className="text-forest" aria-hidden="true" />,
    recommendation: <Lightbulb size={13} className="text-fig-deep" aria-hidden="true" />,
  } as const;

  return (
    <>
      <PageHeader
        title={goal.objective}
        description={`${goal.successMetric}${goal.metricTarget != null ? ` · target ${goal.metricTarget.toLocaleString()}` : ""}${goal.deadline ? ` · deadline ${goal.deadline.toLocaleDateString()}` : " · no deadline"}${goal.constraints ? ` · constraints: ${goal.constraints}` : ""}`}
        actions={<StatusBadge status={goal.status} />}
      />

      {/* The loop in motion — the same five beats the product is built on:
          plan → branches → gates → deliverables → learning. Counts and
          states come straight from the persisted rows above. */}
      <nav aria-label="The goal's loop: plan, branches, gates, deliverables, learning">
        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {descent.map((stage) => {
            const style = STAGE_STYLE[stage.state];
            return (
              <li key={stage.key} className="rounded-lg border border-bark/10 bg-white p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-charcoal">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}${style.pulse && stage.count > 0 ? " animate-pulse" : ""}`}
                  />
                  {stage.label}
                  <span className="ml-auto font-serif text-base text-forest-deep">{stage.count}</span>
                </p>
                <p className={`mt-1 text-[11px] leading-snug ${style.text}`}>{stage.hint}</p>
              </li>
            );
          })}
        </ol>
      </nav>

      <GoalLive
        goalId={goal.id}
        initial={{ status: goal.status, progress: goal.progress }}
        hasOpenWork={tasks.some((t) => ["pending", "ready", "running", "waiting_approval"].includes(t.status))}
      />

      {/* Plan */}
      <Card className="mt-6 rooted" id="plan">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-medium text-charcoal"><FileCheck2 size={16} className="text-forest" aria-hidden="true" /> Execution plan</h2>
            {planMeta?.label && (
              <p className="mt-1 text-xs text-charcoal-soft">
                Drafted by: {planMeta.label}
                {goal.plan?.approvedAt ? ` · approved ${goal.plan.approvedAt.toLocaleDateString()}` : ""}
              </p>
            )}
          </div>
          {goal.plan && <Badge variant={goal.plan.status === "approved" ? "forest" : goal.plan.status === "rejected" ? "clay" : "moss"}>{goal.plan.status}</Badge>}
        </div>

        {!goal.plan ? (
          <p className="mt-3 text-sm text-charcoal-soft">The planner is drafting the plan. This page updates automatically while tasks run.</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-charcoal">{goal.plan.summary}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold tracking-wide text-charcoal-soft">ASSUMPTIONS (to validate)</h3>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-charcoal">
                  {parsed(goal.plan.assumptions).map((a, i) => <li key={i}>{a}</li>)}
                  {parsed(goal.plan.assumptions).length === 0 && <li className="list-none text-charcoal-soft">None recorded.</li>}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold tracking-wide text-charcoal-soft">MISSING INFORMATION</h3>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-charcoal">
                  {parsed(goal.plan.missingInfo).map((a, i) => <li key={i}>{a}</li>)}
                  {parsed(goal.plan.missingInfo).length === 0 && <li className="list-none text-charcoal-soft">None identified.</li>}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold tracking-wide text-charcoal-soft">RISKS</h3>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-charcoal">
                  {parsed(goal.plan.risks).map((a, i) => <li key={i}>{a}</li>)}
                  {parsed(goal.plan.risks).length === 0 && <li className="list-none text-charcoal-soft">None recorded.</li>}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold tracking-wide text-charcoal-soft">PHASES</h3>
                <ol className="mt-1 list-decimal space-y-1 pl-4 text-sm text-charcoal">
                  {phases.map((p, i) => <li key={i}>{p.name} — {p.description}</li>)}
                  {phases.length === 0 && <li className="list-none text-charcoal-soft">No phases recorded.</li>}
                </ol>
              </div>
            </div>
            {goal.plan.status === "planned" && (
              <p className="mt-4 text-sm text-charcoal-soft">
                The plan decision control appears as soon as the planner finishes (status: {goal.status.replace(/_/g, " ")}).
              </p>
            )}
          </>
        )}
      </Card>

      {/* Pending approvals + blockers */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="font-medium text-charcoal">Pending approvals</h2>
          {awaiting.length === 0 ? (
            <p className="mt-2 text-sm text-charcoal-soft">Nothing is waiting on you right now (true zero).</p>
          ) : (
            <ul className="mt-2 space-y-3 text-sm">
              {awaiting.map((t) => (
                <li key={t.id} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-charcoal">{t.title}</span>
                    <Badge variant="moss">{t.type.replace(/_/g, " ")}</Badge>
                  </div>
                  {t.type === "approval_gate" && <GateActions taskId={t.id} />}
                </li>
              ))}
            </ul>
          )}
          {awaiting.some((t) => t.type === "approval_gate") && (
            <p className="mt-2 text-sm text-charcoal-soft">
              Review drafts in <Link href="/app/approvals" className="text-forest hover:underline">Approvals</Link>, then close the gate below.
            </p>
          )}
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 font-medium text-charcoal"><AlertTriangle size={16} className="text-clay" aria-hidden="true" /> Active work & blockers</h2>
          {active.length === 0 && blockers.length === 0 ? (
            <p className="mt-2 text-sm text-charcoal-soft">No task is running and nothing is blocked.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {active.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-charcoal">{t.title}</span>
                  <StatusBadge status={t.status} />
                </li>
              ))}
              {blockers.map((t) => (
                <li key={t.id} className="text-charcoal">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{t.title}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  {t.lastError && <p className="mt-0.5 text-xs text-clay">{t.lastError}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Execution plan: task graph */}
      <Card className="mt-6" id="tasks">
        <h2 className="font-medium text-charcoal">Tasks (persisted execution state)</h2>
        {tasks.length === 0 ? (
          <p className="mt-2 text-sm text-charcoal-soft">No tasks yet — the workflow starts after the plan is drafted.</p>
        ) : (
          <ul className="mt-3 divide-y divide-bark/10">
            {tasks.map((t) => (
              <li key={t.id} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-charcoal">{t.title}</p>
                    <p className="text-xs text-charcoal-soft">
                      {t.agentRole} · attempt {t.attempts}/{t.maxAttempts}
                      {t.dependsOn.length > 0 ? "" : " · no dependencies"}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                {t.output && (
                  <p className="mt-1 line-clamp-2 text-xs text-charcoal-soft">{safeSummary(t.output)}</p>
                )}
                {t.lastError && !t.output && <p className="mt-1 text-xs text-clay">{t.lastError}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Recommendations */}
      <Card className="mt-6 rooted">
        <h2 className="flex items-center gap-2 font-medium text-charcoal"><Lightbulb size={16} className="text-fig" aria-hidden="true" /> Recommendations (evidence-backed)</h2>
        {recommendations.length === 0 ? (
          <p className="mt-2 text-sm text-charcoal-soft">No recommendation yet — it is produced by the analyst after the workflow measures real outcomes.</p>
        ) : (
          recommendations.slice(0, 3).map((r) => {
            const evidence = Array.isArray(JSON.parse(r.evidence || "[]")) ? (JSON.parse(r.evidence) as { source: string; ref: string; summary: string }[]) : [];
            return (
              <div key={r.id} className="mt-3 border-t border-bark/10 pt-3 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-charcoal">{r.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.confidence === "high" ? "forest" : r.confidence === "medium" ? "moss" : "warm"}>confidence: {r.confidence}</Badge>
                    <Badge variant="charcoal">{r.status}</Badge>
                  </div>
                </div>
                <p className="mt-1 text-sm text-charcoal">{r.rationale}</p>
                <ul className="mt-2 space-y-1 text-xs text-charcoal-soft">
                  {evidence.map((e, i) => (
                    <li key={i}><span className="font-medium text-forest">{e.source}</span> — {e.summary}</li>
                  ))}
                  {evidence.length === 0 && <li>No recorded evidence yet — treat this as directional, not measured.</li>}
                </ul>
                {r.uncertainty && <p className="mt-2 text-xs italic text-charcoal-soft">Uncertainty: {r.uncertainty}</p>}
              </div>
            );
          })
        )}
      </Card>

      {/* Learning kept — the rings this goal has grown, one per recorded
          decision or measured outcome. Open proposals do not appear here:
          they are not learning yet, they are requests for the next test. */}
      <Card className="mt-6" id="learning">
        <h2 className="flex items-center gap-2 font-medium text-charcoal">
          <ShieldCheck size={16} className="text-forest" aria-hidden="true" /> Learning kept — the rings so far
        </h2>
        {rings.length === 0 ? (
          <p className="mt-2 text-sm text-charcoal-soft">
            No rings yet. A ring is added when a decision is recorded — the plan approval, a gate passed, a concluded
            experiment, a recommendation acted on — so the next plan grows from what was actually learned, not from a
            fresh guess.
          </p>
        ) : (
          <ol className="mt-3 space-y-0">
            {rings.map((ring, i) => (
              <li
                key={`${ring.kind}-${ring.date.getTime()}-${i}`}
                className="relative flex items-start gap-3 pb-4 last:pb-0"
              >
                {/* the ring line — one ring per kept decision */}
                <span aria-hidden="true" className="relative mt-0.5 flex flex-col items-center">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-forest/25 bg-forest/5">
                    {RING_ICON[ring.kind]}
                  </span>
                  {i < rings.length - 1 && <span className="mt-1 w-px flex-1 bg-forest/15" />}
                </span>
                <span className="min-w-0 flex-1 pb-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-charcoal">{ring.title}</span>
                    {ring.confidence && (
                      <Badge variant={ring.confidence === "high" ? "forest" : ring.confidence === "medium" ? "moss" : "warm"}>
                        confidence: {ring.confidence}
                      </Badge>
                    )}
                    <span className="text-[11px] text-charcoal-soft/70">
                      {ring.date.toLocaleDateString([], { month: "short", day: "numeric" })}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-charcoal-soft">{ring.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Execution records */}
      <Card className="mt-6">
        <h2 className="font-medium text-charcoal">Recent execution records</h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-charcoal-soft">No runs recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-bark/10 pb-2 last:border-0">
                <span className="text-charcoal">{r.task.title}</span>
                <span className="text-xs text-charcoal-soft">
                  attempt {r.attempt} · {r.status} · {r.startedAt.toLocaleTimeString()}
                  {r.finishedAt ? ` → ${r.finishedAt.toLocaleTimeString()}` : " → running"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Linked campaigns + provenance note */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="font-medium text-charcoal">Campaigns serving this goal</h2>
          {campaigns.length === 0 ? (
            <p className="mt-2 text-sm text-charcoal-soft">No campaign yet — it is created by the strategist after the plan is approved.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {campaigns.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <Link href={`/app/campaigns/${c.id}`} className="truncate text-charcoal hover:text-forest">{c.name}</Link>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="font-medium text-charcoal">Context provenance</h2>
          <p className="mt-2 text-sm text-charcoal-soft">
            Facts used by the agents are stored with explicit provenance — inspect and correct them in <Link href="/app/context" className="text-forest hover:underline">Context</Link>. <ProvenanceBadge kind="hypothesis" /> marks unvalidated agent hypotheses.
          </p>
        </Card>
      </div>
    </>
  );
}

function safeSummary(outputJson: string): string {
  try {
    const parsed = JSON.parse(outputJson) as { summary?: string };
    return parsed.summary ?? "";
  } catch {
    return "";
  }
}
