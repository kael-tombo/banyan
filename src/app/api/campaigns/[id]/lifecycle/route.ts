import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { APPROVAL_ACTIONS, availableActions, isLifecycle, LIFECYCLE_LABEL } from "@/lib/campaign/lifecycle";
import { applyCampaignAction, LifecycleError } from "@/lib/campaign/lifecycle-service";

const body = z.object({ action: z.enum(["submit", "approve", "reject", "pause", "resume", "cancel", "complete"]) });

/**
 * POST /api/campaigns/:id/lifecycle — move a campaign through its lifecycle
 * (US-046). Invalid moves return 409; approve and reject need the approve
 * role, the rest need workflow control.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const parsed = await readJson(req, body);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const forbidden = requireRole(ctx.membership.role, APPROVAL_ACTIONS.includes(parsed.data.action) ? "approve" : "control");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;
  try {
    const c = await applyCampaignAction(ctx.workspace.id, id, parsed.data.action);
    const lifecycle = isLifecycle(c.lifecycle) ? c.lifecycle : "draft";
    return json({ campaign: { id: c.id, lifecycle, label: LIFECYCLE_LABEL[lifecycle], status: c.status, actions: availableActions(lifecycle) } });
  } catch (err) {
    if (err instanceof LifecycleError) return json({ error: err.message }, err.status);
    throw err;
  }
}
