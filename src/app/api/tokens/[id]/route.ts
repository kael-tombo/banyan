import { NextRequest } from "next/server";
import { apiError, assertSameOrigin, json, requireWorkspace } from "@/lib/api-utils";
import { revokeApiToken } from "@/lib/api-tokens";
import { recordActivity } from "@/lib/activity";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  if (!(await revokeApiToken(ctx.workspace.id, ctx.user.id, id))) return apiError("Token not found.", 404);
  await recordActivity({ workspaceId: ctx.workspace.id, type: "connection", actorType: "user", actorSummary: ctx.user.name, summary: `${ctx.user.name} revoked an AI assistant access token.`, meta: { tokenId: id } });
  return json({ ok: true });
}
