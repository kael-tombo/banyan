import { NextRequest } from "next/server";
import { apiError, assertSameOrigin, guardRate, json, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { distributeCampaign, DistributeError } from "@/lib/campaign/distribute";

/** POST /api/campaigns/:id/distribute: publish every approved post (US-049). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "control");
  if (forbidden) return apiError(forbidden, 403);
  const limited = await guardRate(req, "campaign-distribute", 6, 60_000);
  if (limited) return limited;
  const { id } = await params;
  try {
    return json(await distributeCampaign(ctx.workspace.id, id));
  } catch (err) {
    if (err instanceof DistributeError) return json({ error: err.message, code: err.code }, err.status);
    throw err;
  }
}
