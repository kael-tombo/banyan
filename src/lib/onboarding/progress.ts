import { prisma } from "@/lib/db";
import { computeProgress, type Progress, type StageKey } from "@/lib/onboarding/stages";

/** Onboarding progress for a workspace (US-018). */
export async function getProgress(workspaceId: string): Promise<Progress> {
  const rows = await prisma.onboardingStage.findMany({ where: { workspaceId }, select: { stage: true, status: true } });
  const recorded: Record<string, "done" | "skipped"> = {};
  for (const r of rows) if (r.status === "done" || r.status === "skipped") recorded[r.stage] = r.status;
  return computeProgress(recorded);
}

/** Record a stage as done or skipped. "done" always wins over an earlier skip. */
export async function markStage(workspaceId: string, stage: StageKey, status: "done" | "skipped"): Promise<void> {
  if (status === "skipped") {
    const existing = await prisma.onboardingStage.findUnique({ where: { workspaceId_stage: { workspaceId, stage } } });
    if (existing?.status === "done") return;
  }
  await prisma.onboardingStage.upsert({
    where: { workspaceId_stage: { workspaceId, stage } },
    create: { workspaceId, stage, status },
    update: { status },
  });
}
