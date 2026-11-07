import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { createApiToken, listApiTokens } from "@/lib/api-tokens";
import { recordActivity } from "@/lib/activity";

/** Personal access tokens for Banyan's read-only MCP server. Each person manages their own. */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  return json({ tokens: await listApiTokens(ctx.workspace.id, ctx.user.id) });
}

const createSchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const parsed = await readJson(req, createSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const existing = await listApiTokens(ctx.workspace.id, ctx.user.id);
  if (existing.length >= 10) return apiError("You already have 10 active tokens. Revoke one first.", 409);
  const { token, id } = await createApiToken(ctx.workspace.id, ctx.user.id, parsed.data.name);
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "connection",
    actorType: "user",
    actorSummary: ctx.user.name,
    summary: `${ctx.user.name} created a read-only access token "${parsed.data.name}" for an AI assistant (MCP).`,
    meta: { tokenId: id },
  });
  // The only time the token is ever returned.
  return json({ id, token }, 201);
}
