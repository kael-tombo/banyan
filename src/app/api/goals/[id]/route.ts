import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { recordActivity } from "@/lib/activity";
import { requireRole } from "@/lib/permissions";
import { canTransitionGoal } from "@/lib/state-machines";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

const patchSchema = z.object({
  status: z.enum(["paused", "active", "cancelled", "achieved", "missed"]).optional(),
  description: z.string().trim().max(1000).optional(),
  constraints: z.string().trim().max(500).optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  metricTarget: z.number().nullable().optional(),
  // R4: credits this goal's drafts may hold or spend; null removes the budget.
  creditBudget: z.number().int().min(0).max(100_000).nullable().optional(),
});

async function loadGoal(id: string, workspaceId: string) {
  return prisma.goal.findFirst({ where: { id, workspaceId }, include: { plan: true } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const goal = await loadGoal(id, ctx.workspace.id);
  if (!goal) return apiError("Not found", 404);
  const tasks = await prisma.agentTask.findMany({ where: { goalId: id }, orderBy: { createdAt: "asc" } });
  const recommendations = await prisma.recommendation.findMany({ where: { goalId: id }, orderBy: { createdAt: "desc" } });
  return json({ goal, tasks, recommendations });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;
  const goal = await loadGoal(id, ctx.workspace.id);
  if (!goal) return apiError("Not found", 404);

  const parsed = await readJson(req, patchSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const data = parsed.data;
  // A budget limits spending, so setting it takes the same role as starting or pausing work.
  if (data.creditBudget !== undefined) {
    const cannot = requireRole(ctx.membership.role, "control");
    if (cannot) return apiError(cannot, 403);
  }

  const update: Record<string, unknown> = {};
  if (data.status) {
    if (!canTransitionGoal(goal.status, data.status)) {
      return apiError(`Cannot move a ${goal.status.replace(/_/g, " ")} goal to ${data.status.replace(/_/g, " ")}.`, 400);
    }
    update.status = data.status;
    // Cancelling (or otherwise ending) a goal halts its open tasks.
    if (["cancelled", "achieved", "missed"].includes(data.status)) {
      await prisma.agentTask.updateMany({
        where: { goalId: id, status: { in: ["pending", "ready", "running", "waiting_approval", "blocked", "failed"] } },
        data: { status: "cancelled", lastError: "Goal ended by the user." },
      });
    }
  }
  if (data.description !== undefined) update.description = data.description;
  if (data.constraints !== undefined) update.constraints = data.constraints;
  if (data.deadline !== undefined) update.deadline = data.deadline ? new Date(data.deadline) : null;
  if (data.metricTarget !== undefined) update.metricTarget = data.metricTarget;
  if (data.creditBudget !== undefined) update.creditBudget = data.creditBudget;

  const updated = await prisma.goal.update({ where: { id }, data: update });
  // Raising or removing the budget lets the drafts it blocked try again; they hold a credit afresh,
  // so a budget that is still too small blocks them again with nothing started.
  if (data.creditBudget !== undefined && (data.creditBudget == null || goal.creditBudget == null || data.creditBudget > goal.creditBudget)) {
    await prisma.agentTask.updateMany({
      where: { goalId: id, type: "content_draft", status: "blocked", lastError: { contains: "credit budget" } },
      data: { status: "ready", lastError: null, leasedUntil: null },
    });
  }
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "goal",
    summary: data.status
      ? `Goal "${goal.objective}" moved to ${data.status.replace(/_/g, " ")}.`
      : data.creditBudget !== undefined
        ? data.creditBudget == null
          ? `Goal "${goal.objective}": draft credit budget removed.`
          : `Goal "${goal.objective}": drafts may use up to ${data.creditBudget} credit${data.creditBudget === 1 ? "" : "s"}.`
        : `Goal "${goal.objective}" updated.`,
    meta: { goalId: id },
  });
  return json({ goal: updated });
}
