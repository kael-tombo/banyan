import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { createStrategy, strategyView, StrategyError } from "@/lib/strategy/service";
import { StrategyInputError } from "@/lib/strategy/generate";
import { pickCurrent } from "@/lib/strategy/review";

/** GET: the latest strategy with its history. POST: generate a new version (US-042). */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const all = await prisma.strategy.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { version: "desc" }, take: 20 });
  const current = pickCurrent(all);
  return json({
    strategy: current ? await strategyView(current) : null,
    versions: all.map((s) => ({ id: s.id, version: s.version, status: s.status, method: s.method, createdAt: s.createdAt.toISOString() })),
  });
}

const body = z.object({ goalId: z.string().max(64).nullish() });

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const limited = await guardRate(req, "strategy-generate", 6, 60_000);
  if (limited) return limited;
  const parsed = await readJson(req, body);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  try {
    const created = await createStrategy({ workspaceId: ctx.workspace.id, userId: ctx.user.id, goalId: parsed.data.goalId });
    return json({ strategy: await strategyView(created) }, 201);
  } catch (err) {
    if (err instanceof StrategyError) return json({ error: err.message, code: err.code }, err.status);
    if (err instanceof StrategyInputError) return json({ error: err.message, code: "invalid_input" }, 422);
    throw err;
  }
}
