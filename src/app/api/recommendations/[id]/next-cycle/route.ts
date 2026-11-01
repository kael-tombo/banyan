import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { recordActivity } from "@/lib/activity";
import { approvalState } from "@/lib/product/profile-review";
import { startGoalWorkflow } from "@/lib/agents/orchestrator";
import { nextCycleFrom } from "@/lib/next-cycle";

/**
 * Accept a cycle's recommendation and start the next cycle with that change.
 * The new goal goes through the normal workflow: Banyan drafts a plan and it
 * waits for the founder's approval. One recommendation starts one cycle.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "goals-create", 10, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);

  const { id } = await params;
  const rec = await prisma.recommendation.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!rec) return apiError("Recommendation not found.", 404);
  if (!rec.goalId) return apiError("This recommendation is not tied to a cycle.", 400);
  const prev = await prisma.goal.findFirst({ where: { id: rec.goalId, workspaceId: ctx.workspace.id } });
  if (!prev) return apiError("The cycle this recommendation came from no longer exists.", 404);

  const profile = await prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id }, select: { fieldSources: true, approvedAt: true } });
  const approval = approvalState(profile);
  if (approval.needsApproval) return json({ error: approval.reason, code: "profile_not_approved" }, 409);

  // Claim the recommendation first: a double click or a second tab cannot start two cycles.
  const claimed = await prisma.recommendation.updateMany({ where: { id: rec.id, status: { in: ["open", "accepted"] } }, data: { status: "acted_upon" } });
  if (claimed.count !== 1) return apiError("This recommendation has already been acted on.", 409);

  const draft = nextCycleFrom(prev, rec, new Date());
  const goal = await prisma.goal.create({
    data: { workspaceId: ctx.workspace.id, ...draft, status: "planning", source: "user", createdBy: ctx.user.id },
  });

  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "goal",
    actorType: "user",
    actorSummary: ctx.user.name,
    summary: `${ctx.user.name} started the next cycle of "${prev.objective}", changing one thing: ${rec.title}.`,
    meta: { goalId: goal.id, previousGoalId: prev.id, recommendationId: rec.id },
  });
  await startGoalWorkflow(goal.id, ctx.workspace.id);

  return json({ goal: { id: goal.id, objective: goal.objective, deadline: goal.deadline } }, 201);
}
