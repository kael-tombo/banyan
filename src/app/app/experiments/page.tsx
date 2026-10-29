import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Card, PageHeader } from "@/components/ui";
import { ExperimentManager } from "./experiments";

export const metadata: Metadata = { title: "Experiments" };

export default async function ExperimentsPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string }>;
}) {
  const { title } = await searchParams;
  const ctx = await requireWorkspaceServer();

  const [experiments, campaigns] = await Promise.all([
    prisma.experiment.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { updatedAt: "desc" },
      include: { campaign: { select: { name: true } } },
    }),
    prisma.campaign.findMany({
      where: { workspaceId: ctx.workspace.id, status: { notIn: ["archived"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  // Honest counts: "needs decision" = completed but no recorded conclusion yet.
  const runningCount = experiments.filter((e) => e.status === "running").length;
  const needsDecision = experiments.filter((e) => e.status === "complete" && !e.interpretation).length;
  const concluded = experiments.filter((e) => e.status === "complete" && !!e.interpretation).length;
  const completedTotal = needsDecision + concluded;
  const plannedCount = experiments.filter((e) => e.status === "planned").length;

  const stats = [
    { label: "Running", value: runningCount, hint: "experiments in progress" },
    { label: "Needs decision", value: needsDecision, hint: "completed without a recorded conclusion" },
    { label: "Concluded", value: concluded, hint: "completed with recorded conclusions" },
    { label: "Planned", value: plannedCount, hint: "declared, not started yet" },
  ];

  return (
    <>
      <PageHeader
        title="Experiments"
        description="One variable at a time, with a pre-declared success metric. Conclusions are drafted only from recorded outcomes — the system will say 'not enough data' rather than invent a result."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className={s.label === "Needs decision" && s.value > 0 ? "rooted-fig" : ""}>
            <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-soft">{s.label}</p>
            <p className="mt-1 font-serif text-3xl text-forest-deep">{s.value}</p>
            <p className="mt-0.5 text-xs text-charcoal-soft">{s.hint}</p>
          </Card>
        ))}
      </div>
      {completedTotal > 0 && (
        <p className="mb-6 -mt-3 text-xs text-charcoal-soft">
          Conclusions recorded in {concluded} of {completedTotal} completed experiment{completedTotal === 1 ? "" : "s"} — the rest are waiting on a decision.
        </p>
      )}
      <ExperimentManager
        prefillTitle={title ? title.slice(0, 140) : undefined}
        campaigns={campaigns}
        experiments={experiments.map((e) => ({
          id: e.id,
          title: e.title,
          hypothesis: e.hypothesis,
          variable: e.variable,
          successMetric: e.successMetric,
          channel: e.channel,
          status: e.status,
          campaignName: e.campaign?.name ?? null,
          results: e.results,
          interpretation: e.interpretation,
          limitations: e.limitations,
          nextAction: e.nextAction,
          updatedAt: e.updatedAt.toISOString(),
        }))}
      />
    </>
  );
}
