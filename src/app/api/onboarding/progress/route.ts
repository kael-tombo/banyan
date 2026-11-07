import { apiError, assertSameOrigin, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { getProgress, markStage } from "@/lib/onboarding/progress";
import { canSkip, isStageKey } from "@/lib/onboarding/stages";
import { NextRequest } from "next/server";
import { z } from "zod";

/**
 * Onboarding progress (US-018).
 * GET  → the nine stages with their status, the stage to resume at, percent,
 *        and whether every required stage is done.
 * POST → { stage, action: "skip" } for an optional stage. Stages are marked
 *        done by saving them (POST /api/onboarding), never by this endpoint.
 */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  return json(await getProgress(ctx.workspace.id));
}

const skipSchema = z.object({ stage: z.string().trim().min(1).max(40), action: z.literal("skip") });

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);

  const parsed = await readJson(req, skipSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  if (!isStageKey(parsed.data.stage)) return apiError(`Unknown stage "${parsed.data.stage}".`, 400);

  const progress = await getProgress(ctx.workspace.id);
  const current = progress.stages.find((s) => s.key === parsed.data.stage)!.status;
  const check = canSkip(parsed.data.stage, current);
  if (!check.ok) return apiError(check.reason, 409);

  await markStage(ctx.workspace.id, parsed.data.stage, "skipped");
  return json(await getProgress(ctx.workspace.id));
}
