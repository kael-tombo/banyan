import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader } from "@/components/ui";
import { AudienceManager } from "./manager";

export default async function AudiencePage() {
  const ctx = await requireWorkspaceServer();
  const insights = await prisma.audienceInsight.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Audience research"
        description="Every entry records its source and confidence. Assumptions from onboarding start at low confidence — upgrade them only when you have real evidence."
      />
      <AudienceManager
        insights={insights.map((i) => ({
          id: i.id, title: i.title, body: i.body, source: i.source, confidence: i.confidence,
          createdAt: i.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
