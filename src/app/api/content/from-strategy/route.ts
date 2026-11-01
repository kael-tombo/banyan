import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin, guardRate, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { writeDraftsFromStrategy } from "@/lib/content/from-strategy";
import { StrategyError } from "@/lib/strategy/service";

const body = z.object({ strategyId: z.string().max(64).optional() });

/**
 * POST /api/content/from-strategy — write drafts from the approved strategy
 * (US-044). 409 without an approved strategy; safe to repeat.
 */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const limited = await guardRate(req, "content-from-strategy", 4, 60_000);
  if (limited) return limited;
  const parsed = await readJson(req, body);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  try {
    const result = await writeDraftsFromStrategy(ctx.workspace.id, { strategyId: parsed.data.strategyId });
    return json(result, result.created.length > 0 ? 201 : 200);
  } catch (err) {
    if (err instanceof StrategyError) return json({ error: err.message, code: err.code }, err.status);
    throw err;
  }
}
