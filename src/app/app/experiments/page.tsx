import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader } from "@/components/ui";
import { ExperimentManager } from "./experiments";

export const metadata: Metadata = { title: "Experiments" };

export default async function ExperimentsPage() {
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

  return (
    <>
      <PageHeader
        title="Experiments"
        description="One variable at a time, with a pre-declared success metric. Conclusions are drafted only from recorded outcomes — the system will say 'not enough data' rather than invent a result."
      />
      <ExperimentManager
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
