import { requireRole } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { recordActivity } from "@/lib/activity";
import { NextRequest } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  // The recommendation lifecycle: open → accepted (saved) | dismissed;
  // accepted → acted_upon once it becomes an experiment; dismissed → open to restore.
  status: z.enum(["open", "accepted", "dismissed", "acted_upon"]),
});

/** Move an opportunity through its lifecycle (workspace-scoped). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;
  const recommendation = await prisma.recommendation.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!recommendation) return apiError("Opportunity not found.", 404);

  const parsed = await readJson(req, patchSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const updated = await prisma.recommendation.update({
    where: { id: recommendation.id },
    data: { status: parsed.data.status },
  });

  const verbs: Record<string, string> = {
    open: "reopened",
    accepted: "saved",
    dismissed: "dismissed",
    acted_upon: "marked acted upon",
  };
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "recommendation",
    actorType: "user",
    summary: `Opportunity "${recommendation.title}" ${verbs[parsed.data.status]}.`,
    meta: { recommendationId: recommendation.id },
  });

  return json({ recommendation: updated });
}
