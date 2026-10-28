import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, EmptyState, PageHeader, StatusBadge, LinkButton } from "@/components/ui";
import { ArrowRight, CheckCircle2, AlertTriangle, Target, Lightbulb } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireWorkspaceServer();
  const wid = ctx.workspace.id;

  const [
    profile,
    goals,
    recentActivity,
    pendingApprovals,
    publications,
    links,
    recommendations,
    blockedTasks,
  ] = await Promise.all([
    prisma.productProfile.findUnique({ where: { workspaceId: wid } }),
    prisma.goal.findMany({ where: { workspaceId: wid, status: { in: ["planning", "awaiting_approval", "active", "paused"] } }, orderBy: { updatedAt: "desc" }, take: 3 }),
    prisma.activityEvent.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.contentItem.findMany({ where: { workspaceId: wid, status: "ready_for_review" }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.publication.findMany({ where: { contentItem: { workspaceId: wid }, status: "published" }, orderBy: { publishedAt: "desc" }, take: 5, include: { contentItem: true } }),
    prisma.trackedLink.aggregate({ where: { workspaceId: wid }, _sum: { clicks: true } }),
    prisma.recommendation.findMany({ where: { workspaceId: wid, status: "open" }, orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.agentTask.findMany({ where: { workspaceId: wid, status: { in: ["blocked", "failed"] } }, orderBy: { updatedAt: "desc" }, take: 4 }),
  ]);

  const trackedClicks = links._sum.clicks ?? 0;
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

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Execution-first summary: the current goal, what the workflow is doing, what waits on you, and what the evidence says. Zeros are true zeros; anything unmeasured is labeled as such."
      />

      {/* 1. Current goal and progress */}
      <Card className="rooted">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium text-charcoal-soft"><Target size={14} className="text-forest" aria-hidden="true" /> Current goal</p>
            {activeGoal ? (
              <>
                <Link href={`/app/goals/${activeGoal.id}`} className="mt-1 block font-medium text-charcoal hover:text-forest">{activeGoal.objective}</Link>
                <p className="mt-0.5 text-sm text-charcoal-soft">
                  {activeGoal.successMetric}{activeGoal.metricTarget != null ? ` · target ${activeGoal.metricTarget.toLocaleString()}` : ""}{activeGoal.deadline ? ` · by ${activeGoal.deadline.toLocaleDateString()}` : ""}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-charcoal-soft">No active goal. <Link href="/app/goals" className="text-forest hover:underline">Set one in plain language</Link> — the runtime handles the rest.</p>
            )}
          </div>
          {activeGoal && <StatusBadge status={activeGoal.status} />}
        </div>
        {activeGoal && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-ivory-deep/70" role="progressbar" aria-valuenow={activeGoal.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Goal progress">
              <div className="h-full rounded-full bg-forest" style={{ width: `${Math.min(100, activeGoal.progress)}%` }} />
            </div>
            <p className="mt-1 text-xs text-charcoal-soft">
              {goalTasks.filter((t) => t.status === "completed").length}/{goalTasks.filter((t) => t.status !== "cancelled").length} tasks complete · {activeGoal.progress}%
            </p>
          </div>
        )}
      </Card>

      {/* 2/3. Execution status + blockers */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="font-medium text-charcoal">Execution status</h2>
          {goalTasks.length === 0 ? (
            <p className="mt-2 text-sm text-charcoal-soft">{activeGoal ? "The planner is drafting the plan — refresh in a moment." : "No workflow running."}</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {(["running", "ready", "waiting_approval", "pending", "blocked", "failed", "completed"] as const).flatMap((status) =>
                goalTasks
                  .filter((t) => t.status === status)
                  .slice(0, 2)
                  .map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-charcoal">{t.title}</span>
                      <StatusBadge status={t.status} />
                    </li>
                  ))
              )}
            </ul>
          )}
          {activeGoal && <Link href={`/app/goals/${activeGoal.id}`} className="mt-2 inline-block text-sm text-forest hover:underline">Open the execution view →</Link>}
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 font-medium text-charcoal"><AlertTriangle size={16} className="text-clay" aria-hidden="true" /> Blockers</h2>
          {blockedTasks.length === 0 ? (
            <p className="mt-2 text-sm text-charcoal-soft">Nothing is blocked (true zero). Blocked work shows here with its actionable fix.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {blockedTasks.map((t) => (
                <li key={t.id}>
                  <div className="flex items-center justify-between gap-2">
                    <Link href={t.goalId ? `/app/goals/${t.goalId}` : "/app/goals"} className="truncate text-charcoal hover:text-forest">{t.title}</Link>
                    <StatusBadge status={t.status} />
                  </div>
                  {t.lastError && <p className="mt-0.5 line-clamp-2 text-xs text-clay">{t.lastError}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 4. Pending approvals */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="flex items-center gap-2 font-medium text-charcoal"><CheckCircle2 size={16} className="text-clay" aria-hidden="true" /> Awaiting your approval</h2>
          {pendingApprovals.length === 0 && awaitingTasks.length === 0 ? (
            <p className="mt-2 text-sm text-charcoal-soft">Queue is empty (true zero — not unavailable data).</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {pendingApprovals.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <Link href={`/app/content/${c.id}`} className="truncate text-charcoal hover:text-forest">{c.title}</Link>
                  <Badge variant="warm">{c.channel}</Badge>
                </li>
              ))}
              {awaitingTasks
                .filter((t) => t.type === "approval_gate")
                .map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <Link href={t.goalId ? `/app/goals/${t.goalId}` : "/app/goals"} className="truncate text-charcoal hover:text-forest">{t.title}</Link>
                    <Badge variant="moss">gate</Badge>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        {/* 5. Recent outcomes */}
        <Card>
          <h2 className="font-medium text-charcoal">Recent outcomes (observed)</h2>
          {publications.length === 0 && trackedClicks === 0 ? (
            <p className="mt-2 text-sm text-charcoal-soft">No confirmed publications or tracked clicks yet. Outcomes appear only after the provider confirms — never before.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {publications.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <Link href={`/app/content/${p.contentItemId}`} className="truncate text-charcoal hover:text-forest">{p.contentItem.title}</Link>
                  <Badge variant={p.manual ? "warm" : "forest"}>{p.manual ? "manual" : p.provider}{p.manual ? " (user-confirmed)" : ""}</Badge>
                </li>
              ))}
              {trackedClicks > 0 && <li className="text-charcoal-soft">{trackedClicks.toLocaleString()} tracked click(s) recorded in total.</li>}
            </ul>
          )}
        </Card>
      </div>

      {/* 6. Evidence-backed next actions */}
      <div className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 font-medium text-charcoal"><Lightbulb size={16} className="text-fig" aria-hidden="true" /> Recommended next actions</h2>
        {recommendations.length === 0 && setupSuggestions.length === 0 ? (
          <EmptyState
            title="Everything is in motion"
            body="No open setup steps and no stored recommendations. Recommendations appear after a workflow measures real outcomes and evaluates them."
            icon={<Lightbulb size={22} className="text-forest" />}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recommendations.map((r) => (
              <div key={r.id} className="card-lift rooted flex flex-col rounded-[3px] border border-bark/15 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-charcoal">{r.title}</p>
                  <Badge variant={r.confidence === "high" ? "forest" : r.confidence === "medium" ? "moss" : "warm"}>{r.confidence}</Badge>
                </div>
                <p className="mt-1 line-clamp-3 text-xs text-charcoal-soft">{r.rationale}</p>
                <p className="mt-2 text-xs italic text-charcoal-soft">{r.uncertainty}</p>
                {r.goalId && <Link href={`/app/goals/${r.goalId}`} className="mt-2 text-xs text-forest hover:underline">Open the goal →</Link>}
              </div>
            ))}
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
        )}
      </div>

      {/* Activity trail */}
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

      {goals.length === 0 && (
        <div className="mt-4">
          <LinkButton href="/app/goals" variant="secondary">Create your first goal</LinkButton>
        </div>
      )}
    </>
  );
}
