import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { recordActivity } from "@/lib/activity";
import { requireRole } from "@/lib/permissions";
import { canTransitionTask } from "@/lib/state-machines";
import { z } from "zod";
import { NextRequest } from "next/server";

/**
 * User-initiated task control: retry a blocked/failed task, or cancel it.
 * Retrying preserves all workflow state — the handler re-runs with its stored
 * inputs and dedupe key, adopting previously completed work instead of
 * duplicating it.
 */
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("approve_gate") }), // complete an approval_gate task after human approval in the content UI
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = guardRate(req, "task-control", 30, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "control");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;

  const task = await prisma.agentTask.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!task) return apiError("Not found", 404);

  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  if (parsed.data.action === "retry") {
    if (!["blocked", "failed", "cancelled"].includes(task.status)) {
      return apiError(`A ${task.status.replace(/_/g, " ")} task cannot be retried.`, 400);
    }
    // Cancelled tasks need to pass through a legal transition; blocked/failed go ready directly.
    if (task.status === "cancelled") {
      return apiError("A cancelled task belongs to an ended workflow. Create a new goal instead.", 400);
    }
    if (!canTransitionTask(task.status, "ready")) {
      return apiError(`Transition ${task.status} → ready is not allowed.`, 400);
    }
    await prisma.agentTask.update({
      where: { id: task.id },
      data: { status: "ready", lastError: null, leasedUntil: null, output: null },
    });
    await recordActivity({
      workspaceId: ctx.workspace.id,
      type: "task",
      actorType: "user",
      actorSummary: ctx.user.email,
      summary: `Task retried by the user: ${task.title}`,
      meta: { taskId: task.id },
    });
    return json({ ok: true, status: "ready" });
  }

  if (parsed.data.action === "cancel") {
    if (!canTransitionTask(task.status, "cancelled")) {
      return apiError(`A ${task.status.replace(/_/g, " ")} task cannot be cancelled.`, 400);
    }
    await prisma.agentTask.update({ where: { id: task.id }, data: { status: "cancelled", lastError: "Cancelled by the user." } });
    await recordActivity({
      workspaceId: ctx.workspace.id,
      type: "task",
      actorType: "user",
      actorSummary: ctx.user.email,
      summary: `Task cancelled: ${task.title}`,
      meta: { taskId: task.id },
    });
    return json({ ok: true, status: "cancelled" });
  }

  // approve_gate: the human approved the content in the Approvals UI; if every
  // item is approved, the gate task completes here (explicit human action).
  if (task.type !== "approval_gate") return apiError("This action applies only to approval gates.", 400);
  if (task.status !== "waiting_approval") return apiError("This approval gate is not waiting for approval.", 400);
  const campaignId = typeof (JSON.parse(task.inputs || "{}") as Record<string, unknown>).campaignId === "string" ? (JSON.parse(task.inputs) as { campaignId: string }).campaignId : null;
  const pending = await prisma.contentItem.count({
    where: { workspaceId: ctx.workspace.id, ...(campaignId ? { campaignId } : {}), status: { in: ["draft", "ready_for_review"] } },
  });
  if (pending > 0) return apiError(`${pending} draft(s) still need review before this gate can close.`, 400);
  if (!canTransitionTask(task.status, "completed")) return apiError("Illegal transition.", 400);
  await prisma.agentTask.update({
    where: { id: task.id },
    data: {
      status: "completed",
      completedAt: new Date(),
      lastError: null,
      output: JSON.stringify({ summary: `Approval gate closed by ${ctx.user.email} after recorded human approvals.`, data: { approvedIds: [] } }),
    },
  });
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "approval",
    actorType: "user",
    actorSummary: ctx.user.email,
    summary: "Approval gate closed — all campaign drafts carry recorded approval.",
    meta: { taskId: task.id },
  });
  return json({ ok: true, status: "completed" });
}
