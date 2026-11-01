import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { editStrategy, strategyView, StrategyError } from "@/lib/strategy/service";

/** One strategy version, scoped to the caller's workspace. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const s = await prisma.strategy.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!s) return apiError("Not found.", 404);
  return json({ strategy: await strategyView(s) });
}

const body = z.object({ body: z.record(z.unknown()) });

/** Save edits as the next version (US-043). The edited version is untouched. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const parsed = await readJson(req, body);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const { id } = await params;
  try {
    return json({ strategy: await strategyView(await editStrategy(ctx.workspace.id, id, ctx.user.id, parsed.data.body)) }, 201);
  } catch (err) {
    if (err instanceof StrategyError) return json({ error: err.message, code: err.code }, err.status);
    throw err;
  }
}
