import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { rejectStrategy, strategyView, StrategyError } from "@/lib/strategy/service";

const body = z.object({ reason: z.string().trim().min(3, "Say briefly why, so the next version can address it.").max(500) });

/** Reject a proposed strategy with a reason (US-043). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "approve");
  if (forbidden) return apiError(forbidden, 403);
  const parsed = await readJson(req, body);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const { id } = await params;
  try {
    return json({ strategy: await strategyView(await rejectStrategy(ctx.workspace.id, id, parsed.data.reason)) });
  } catch (err) {
    if (err instanceof StrategyError) return json({ error: err.message, code: err.code }, err.status);
    throw err;
  }
}
