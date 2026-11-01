import { NextRequest } from "next/server";
import { apiError, assertSameOrigin, json, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { approveStrategy, strategyView, StrategyError } from "@/lib/strategy/service";

/** Approve a proposed strategy (US-043). Owners and members only; idempotent. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "approve");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;
  try {
    return json({ strategy: await strategyView(await approveStrategy(ctx.workspace.id, id, ctx.user.id)) });
  } catch (err) {
    if (err instanceof StrategyError) return json({ error: err.message, code: err.code }, err.status);
    throw err;
  }
}
