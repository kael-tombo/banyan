import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { recordActivity } from "@/lib/activity";
import { requireRole } from "@/lib/permissions";
import { canTransitionGoal, canTransitionTask } from "@/lib/state-machines";
import { completePlanTask, blockPlanTask } from "@/lib/agents/orchestrator";
import { z } from "zod";
import { NextRequest } from "next/server";

/**
 * Human decision on a drafted plan. Nothing consequential has run before this
 * point; approval starts real execution, rejection blocks the plan task until
 * the user regenerates or cancels.
 */
const schema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }),
  z.object({ decision: z.literal("reject"), reason: z.string().trim().min(3).max(500) }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "plan-approve", 30, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "approve");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;

  const goal = await prisma.goal.findFirst({ where: { id, workspaceId: ctx.workspace.id }, include: { plan: true } });
  if (!goal) return apiError("Not found", 404);
  if (!goal.plan) return apiError("No plan has been drafted yet.", 400);

  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  if (parsed.data.decision === "approve") {
    if (goal.plan.status !== "planned") return apiError(`This plan is already ${goal.plan.status}.`, 400);
    await prisma.goalPlan.update({
      where: { id: goal.plan.id },
      data: { status: "approved", approvedById: ctx.user.id, approvedAt: new Date() },
    });
    if (canTransitionGoal(goal.status, "active")) {
      await prisma.goal.update({ where: { id: goal.id }, data: { status: "active" } });
    }
    // Complete the plan_draft agent task (it was waiting for this approval).
    const planTask = await prisma.agentTask.findUnique({ where: { dedupeKey: `goal:${goal.id}:plan_draft` } });
    if (planTask && planTask.status === "waiting_approval" && canTransitionTask(planTask.status, "completed")) {
      await completePlanTask(planTask.id, {
        summary: `Plan approved by ${ctx.user.email}; execution started.`,
        data: { planId: goal.plan.id, status: "approved" },
        refs: { planId: goal.plan.id },
      });
    }
    await recordActivity({
      workspaceId: ctx.workspace.id,
      type: "plan",
      actorType: "user",
      actorSummary: ctx.user.email,
      summary: `Plan approved for "${goal.objective}" — the workflow may now execute (research → strategy → campaign → content, each gated as designed).`,
      meta: { goalId: goal.id, planId: goal.plan.id },
    });
    return json({ ok: true, decision: "approved" });
  }

  // Rejection
  if (goal.plan.status !== "planned") return apiError(`This plan is already ${goal.plan.status}.`, 400);
  await prisma.goalPlan.update({
    where: { id: goal.plan.id },
    data: { status: "rejected", rejectedReason: parsed.data.reason },
  });
  const planTask = await prisma.agentTask.findUnique({ where: { dedupeKey: `goal:${goal.id}:plan_draft` } });
  if (planTask && planTask.status === "waiting_approval") {
    await blockPlanTask(planTask.id, parsed.data.reason);
  }
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "plan",
    actorType: "user",
    actorSummary: ctx.user.email,
    summary: `Plan rejected for "${goal.objective}": ${parsed.data.reason}`,
    meta: { goalId: goal.id, planId: goal.plan.id },
  });
  return json({ ok: true, decision: "rejected" });
}
