import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { ArrowRight, RefreshCw } from "lucide-react";

export const metadata: Metadata = { title: "Cycles" };
export const dynamic = "force-dynamic";

export default async function CyclesPage() {
  const ctx = await requireWorkspaceServer();
  const goals = await prisma.goal.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      plan: { select: { status: true } },
      campaigns: {
        select: {
          id: true,
          name: true,
          items: { select: { status: true } },
        },
      },
      recommendations: { where: { status: "open" }, select: { id: true } },
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Complete cycle"
        title="Cycles"
        description="A cycle is one goal run end to end: product context, plan, three channel-native assets, human approval, real publishing, measured results, and a proposed next move. It is the unit Banyan is built around."
        actions={<LinkButton href="/app/cycles/new"><RefreshCw size={14} aria-hidden="true" /> Start a cycle</LinkButton>}
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={<RefreshCw size={22} className="text-forest" />}
          title="Run the first complete cycle"
          body="Paste a product URL, correct the snapshot, choose two or three channels, and approve one plan. The first cycle is the proof — not a report about a cycle."
          action={<LinkButton href="/app/cycles/new">Start a cycle</LinkButton>}
        />
      ) : (
        <div className="grid gap-3">
          {goals.map((goal) => {
            const itemCount = goal.campaigns.reduce((sum, c) => sum + c.items.length, 0);
            const publishedCount = goal.campaigns.reduce(
              (sum, c) => sum + c.items.filter((i) => i.status === "published").length,
              0
            );
            return (
              <Link
                key={goal.id}
                href={`/app/cycles/${goal.id}`}
                className="card-lift group block rounded-2xl border border-bark/12 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-serif text-xl leading-snug tracking-[-0.01em] text-forest-deep">
                      {goal.objective}
                    </h2>
                    <p className="mt-1 text-sm text-charcoal-soft">
                      {goal.successMetric}
                      {goal.metricTarget != null ? ` · target ${goal.metricTarget.toLocaleString()}` : ""}
                      {goal.deadline ? ` · by ${goal.deadline.toLocaleDateString()}` : " · no deadline"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={goal.status} />
                    <ArrowRight
                      size={15}
                      className="text-charcoal-soft/35 transition-transform group-hover:translate-x-0.5 group-hover:text-forest"
                      aria-hidden="true"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <Badge variant={goal.plan?.status === "approved" ? "forest" : "warm"}>
                    plan {goal.plan?.status ?? "not drafted"}
                  </Badge>
                  <Badge variant="charcoal">{itemCount} asset{itemCount === 1 ? "" : "s"}</Badge>
                  <Badge variant={publishedCount > 0 ? "forest" : "warm"}>{publishedCount} published</Badge>
                  <Badge variant={goal.recommendations.length > 0 ? "moss" : "warm"}>
                    {goal.recommendations.length > 0 ? "next move proposed" : "no next move yet"}
                  </Badge>
                  <Badge variant="warm">{Math.round(goal.progress)}% executed</Badge>
                </div>

                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ivory-deep/70" aria-hidden="true">
                  <div className="h-full rounded-full bg-forest/70" style={{ width: `${Math.min(100, goal.progress)}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-xs leading-relaxed text-charcoal-soft">
        Every goal appears here, including goals started from the goal composer. A goal that has not been given product
        context will show the plan and records it actually has; the cycle view never fills the gaps in.
      </p>
    </>
  );
}
