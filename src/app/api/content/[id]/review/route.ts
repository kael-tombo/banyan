import { syncCampaignLifecycle } from "@/lib/campaign/lifecycle-service";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { canTransitionContent } from "@/lib/state-machines";
import { recordActivity } from "@/lib/activity";
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit") }),          // draft → ready_for_review
  z.object({ action: z.literal("approve") }),         // ready_for_review → approved (records approver)
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3).max(500) }), // → rejected (reason required)
  z.object({ action: z.literal("back_to_draft") }),   // ready_for_review → draft
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const item = await prisma.contentItem.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!item) return apiError("Content not found.", 404);

  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const targets: Record<string, string> = { submit: "ready_for_review", approve: "approved", reject: "rejected", back_to_draft: "draft" };
  const target = targets[parsed.data.action];
  if (!canTransitionContent(item.status, target)) {
    return apiError(`Invalid transition: ${item.status} → ${target}.`, 400);
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.action === "approve") {
    // Human approver recorded.
    data.approvedById = ctx.user.id;
    data.approvedAt = new Date();
    data.rejectionReason = null;
  }
  if (parsed.data.action === "reject") {
    data.rejectionReason = parsed.data.reason;
    data.approvedById = null;
    data.approvedAt = null;
  }
  if (parsed.data.action === "submit" || parsed.data.action === "back_to_draft") {
    data.approvedById = null;
    data.approvedAt = null;
    data.rejectionReason = null;
  }

  const updated = await prisma.contentItem.update({ where: { id: item.id }, data: { status: target, ...data } });

  if (parsed.data.action === "approve") {
    await recordActivity({
      workspaceId: ctx.workspace.id,
      type: "approval",
      actorType: "user",
      actorSummary: ctx.user.email,
      summary: `"${item.title}" approved by ${ctx.user.name} (human). Publishing may proceed only through the configured connection.`,
      meta: { contentItemId: item.id, approverId: ctx.user.id },
    });
  } else if (parsed.data.action === "reject") {
    await recordActivity({
      workspaceId: ctx.workspace.id,
      type: "rejection",
      actorType: "user",
      actorSummary: ctx.user.email,
      summary: `"${item.title}" rejected: ${parsed.data.reason}`,
      meta: { contentItemId: item.id },
    });
  } else {
    await recordActivity({
      workspaceId: ctx.workspace.id,
      type: "approval",
      summary: `"${item.title}" moved to ${target} by ${ctx.user.name}.`,
      meta: { contentItemId: item.id },
    });
  }

  await syncCampaignLifecycle(updated.campaignId);
  return json({ item: updated });
}
