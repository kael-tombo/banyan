import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, EmptyState, PageHeader, StatusBadge, LinkButton } from "@/components/ui";
import { Target } from "lucide-react";
import NewGoalForm from "./new-goal-form";

export const dynamic = "force-dynamic";

const GOAL_STATUS_VARIANTS: Record<string, "forest" | "moss" | "clay" | "warm" | "charcoal"> = {
  draft: "warm",
  planning: "warm",
  awaiting_approval: "moss",
  active: "forest",
  paused: "charcoal",
  achieved: "forest",
  missed: "clay",
  cancelled: "charcoal",
};

export default async function GoalsPage() {
  const ctx = await requireWorkspaceServer();
  const goals = await prisma.goal.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { tasks: true, campaigns: true, recommendations: true } } },
  });

  const openRecommendations = await prisma.recommendation.count({ where: { workspaceId: ctx.workspace.id, status: "open" } });

  return (
    <>
      <PageHeader
        title="Goals"
        description="State what you want in plain language. Banyan drafts a structured plan, explains its assumptions, asks what is missing, and waits for your approval before acting. Execution state persists — crashed runs resume where they stopped."
        actions={openRecommendations > 0 ? <LinkButton href="/app/analytics" variant="secondary" size="sm">{openRecommendations} open recommendation(s)</LinkButton> : undefined}
      />

      <NewGoalForm />

      <div className="mt-8 space-y-4">
        <h2 className="font-medium text-charcoal">Your goals</h2>
        {goals.length === 0 ? (
          <EmptyState
            icon={<Target size={22} className="text-forest" />}
            title="No goals yet"
            body="Everything in the execution runtime hangs off a goal: the plan, the tasks, the evidence and the recommendation. Create the first one above — a sentence is enough."
          />
        ) : (
          goals.map((g) => (
            <Link key={g.id} href={`/app/goals/${g.id}`} className="block">
              <Card className="card-lift rooted transition-colors hover:border-forest/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-charcoal">{g.objective}</p>
                    <p className="mt-1 text-sm text-charcoal-soft">
                      {g.successMetric}
                      {g.metricTarget != null ? ` · target ${g.metricTarget.toLocaleString()}` : " · no target set"}
                      {g.deadline ? ` · by ${g.deadline.toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <Badge variant={GOAL_STATUS_VARIANTS[g.status] ?? "warm"}>{g.status.replace(/_/g, " ")}</Badge>
                </div>
                <div className="mt-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ivory-deep/70" role="progressbar" aria-valuenow={g.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Goal progress ${g.progress}%`}>
                    <div className="h-full rounded-full bg-forest" style={{ width: `${Math.min(100, g.progress)}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-charcoal-soft">
                    <span>{g.progress}% of tasks complete</span>
                    <span aria-hidden="true">·</span>
                    <span>{g._count.tasks} task(s)</span>
                    <span aria-hidden="true">·</span>
                    <span>{g._count.campaigns} campaign(s)</span>
                    <span aria-hidden="true">·</span>
                    <span>{g._count.recommendations} recommendation(s)</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
