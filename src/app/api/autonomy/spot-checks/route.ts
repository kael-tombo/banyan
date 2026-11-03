import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { SPOT_CHECK_VERDICTS } from "@/lib/autonomy/trust";
import { pendingSpotChecks, recordSpotCheck } from "@/lib/autonomy/spot-checks";

const schema = z.object({ contentItemId: z.string().min(1).max(100), verdict: z.enum(SPOT_CHECK_VERDICTS) });

/** Drafts the supervised policy approved that are waiting for the founder's spot check. */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  return json({ pending: await pendingSpotChecks(ctx.workspace.id) });
}

/** Record the founder's verdict; "stop" also stops a post that has not gone out. */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "approve");
  if (forbidden) return apiError(forbidden, 403);
  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const res = await recordSpotCheck(ctx.workspace.id, { id: ctx.user.id, name: ctx.user.name }, parsed.data.contentItemId, parsed.data.verdict);
  if (!res.ok) return apiError(res.message, res.status);
  return json(res);
}
