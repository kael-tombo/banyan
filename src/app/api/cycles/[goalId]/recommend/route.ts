import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { recordActivity } from "@/lib/activity";
import { loadCycleReport } from "@/lib/cycle-report-data";
import { recommendFromReport } from "@/lib/cycle-recommend";

/**
 * Propose the next move for a cycle from its own report, when it has none.
 * Asked for by the founder (the report page never writes on view); one open
 * recommendation per cycle at a time.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);

  const loaded = await loadCycleReport(ctx.workspace.id, (await params).goalId);
  if (!loaded) return apiError("Cycle not found.", 404);
  // One recommendation per cycle: once acted on, the next cycle exists and this one is closed.
  if (loaded.recommendation) {
    return apiError("This cycle already has a recommendation.", 409);
  }

  const r = recommendFromReport(loaded.report);
  const rec = await prisma.recommendation.create({
    data: {
      workspaceId: ctx.workspace.id,
      goalId: loaded.goal.id,
      campaignId: loaded.campaignIds[0] ?? null,
      title: r.title,
      rationale: r.rationale,
      evidence: JSON.stringify(r.evidence),
      confidence: r.confidence,
      uncertainty: r.uncertainty,
      status: "open",
      producedBy: "analyst:cycle-report",
    },
  });
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "recommendation",
    actorType: "ai",
    summary: `Next move proposed from the cycle report (confidence: ${r.confidence}): ${r.title}`,
    meta: { recommendationId: rec.id, goalId: loaded.goal.id },
  });
  return json({ recommendation: { id: rec.id, title: rec.title, confidence: rec.confidence } }, 201);
}
