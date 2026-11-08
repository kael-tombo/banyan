import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { recordActivity } from "@/lib/activity";
import { NextRequest } from "next/server";
import { z } from "zod";

/**
 * Agent activity control — pause or resume the agentic runtime for the
 * caller's workspace. Enforcement lives in advanceWorkspace (the single
 * funnel every caller goes through), so a paused workspace advances nothing:
 * the UI advance button, the background worker, and any future caller all
 * respect it. Pausing is a human decision and is recorded in the audit trail.
 */
const schema = z.object({ paused: z.boolean() });

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "agent-pause", 20, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "control");
  if (forbidden) return apiError(forbidden, 403);

  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const agentsPausedAt = parsed.data.paused ? new Date() : null;
  await prisma.workspace.update({ where: { id: ctx.workspace.id }, data: { agentsPausedAt } });

  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "agent_control",
    actorType: "user",
    actorSummary: ctx.user.email,
    summary: parsed.data.paused
      ? "Agent activity paused — the runtime will not execute new task work until resumed."
      : "Agent activity resumed — queued work can advance again.",
    meta: { paused: parsed.data.paused },
  });

  return json({ ok: true, agentsPausedAt: agentsPausedAt?.toISOString() ?? null });
}
