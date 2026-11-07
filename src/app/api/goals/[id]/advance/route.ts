import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { advanceWorkspace } from "@/lib/agents/orchestrator";
import { NextRequest } from "next/server";

/**
 * Advance the agentic workflow for the caller's workspace: promote tasks whose
 * dependencies resolved, execute the next safe batch (in parallel only when
 * independent), reconcile recoverable failures, refresh goal progress.
 *
 * Called by the UI while work is pending and by the background worker. Safe
 * to call concurrently — tasks are claimed atomically.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "goal-advance", 30, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "control");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;

  const goal = await prisma.goal.findFirst({ where: { id, workspaceId: ctx.workspace.id }, select: { id: true } });
  if (!goal) return apiError("Not found", 404);

  const report = await advanceWorkspace(ctx.workspace.id, { userId: ctx.user.id, maxTasks: 4 });
  return json({ ok: true, report });
}
