import { requireRole } from "@/lib/permissions";
import { syncCampaignLifecycle } from "@/lib/campaign/lifecycle-service";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { canTransitionContent } from "@/lib/state-machines";
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.object({
  scheduledFor: z.string().datetime({ offset: true }).optional().nullable(), // UTC ISO
  cancel: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "control");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;
  const item = await prisma.contentItem.findFirst({ where: { id, workspaceId: ctx.workspace.id }, include: { publications: true } });
  if (!item) return apiError("Content not found.", 404);

  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  if (parsed.data.cancel) {
    if (!["scheduled", "approved", "failed"].includes(item.status)) {
      return apiError(`Nothing to cancel in status "${item.status}".`, 400);
    }
    // Pending scheduled publication is cancelled.
    await prisma.publication.updateMany({
      where: { contentItemId: item.id, status: "scheduled" },
      data: { status: "blocked", lastError: "Schedule cancelled by user." },
    });
    const updated = await prisma.contentItem.update({
      where: { id: item.id },
      data: { status: "approved", scheduledFor: null },
    });
    await syncCampaignLifecycle(updated.campaignId);
    return json({ item: updated, cancelled: true });
  }

  if (!parsed.data.scheduledFor) return apiError("scheduledFor is required.", 400);
  const when = new Date(parsed.data.scheduledFor);
  if (when.getTime() < Date.now() - 60_000) return apiError("Scheduled time is in the past.", 400);
  if (!["approved"].includes(item.status)) {
    return apiError(`Only approved content can be scheduled (currently: ${item.status}).`, 400);
  }

  const updated = await prisma.contentItem.update({
    where: { id: item.id },
    data: { status: "scheduled", scheduledFor: when },
  });
  await syncCampaignLifecycle(updated.campaignId);
  return json({ item: updated });
}
