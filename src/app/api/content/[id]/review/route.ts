import { syncCampaignLifecycle } from "@/lib/campaign/lifecycle-service";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { canTransitionContent } from "@/lib/state-machines";
import { recordActivity } from "@/lib/activity";
import { requireRole } from "@/lib/permissions";
import { loadClaimEvidence } from "@/lib/content/claim-evidence";
import { unsupportedClaims, unvouched } from "@/lib/content/claims";
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit") }),          // draft → ready_for_review
  // ready_for_review → approved (records approver). vouchedClaims: keys of unsupported claims the approver vouches for (US-054).
  z.object({ action: z.literal("approve"), vouchedClaims: z.array(z.string().max(400)).max(50).default([]) }),
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

  const decision = parsed.data.action === "approve" || parsed.data.action === "reject";
  const forbidden = requireRole(ctx.membership.role, decision ? "approve" : "write");
  if (forbidden) return apiError(forbidden, 403);

  const targets: Record<string, string> = { submit: "ready_for_review", approve: "approved", reject: "rejected", back_to_draft: "draft" };
  const target = targets[parsed.data.action];
  if (!canTransitionContent(item.status, target)) {
    return apiError(`Invalid transition: ${item.status} → ${target}.`, 400);
  }

  // US-054: no approval while the text makes a claim nothing backs, unless the approver vouches for it.
  let vouched: { key: string; phrase: string }[] = [];
  if (parsed.data.action === "approve") {
    const evidenceFor = await loadClaimEvidence(ctx.workspace.id);
    const claims = unsupportedClaims(item.body, evidenceFor(item.campaignId, item.sourceRef));
    const open = unvouched(claims, parsed.data.vouchedClaims);
    if (open.length > 0) {
      return json(
        {
          error: `This draft makes ${open.length} claim${open.length === 1 ? "" : "s"} nothing in your profile, facts or campaign evidence backs. Remove ${open.length === 1 ? "it" : "them"}, add the source, or vouch for ${open.length === 1 ? "it" : "them"} to approve.`,
          unsupportedClaims: open.map((c) => ({ key: c.key, kind: c.kind, phrase: c.phrase, why: c.why })),
        },
        409
      );
    }
    vouched = claims.map((c) => ({ key: c.key, phrase: c.phrase }));
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
      summary: `"${item.title}" approved by ${ctx.user.name} (human).${vouched.length ? ` They vouched for ${vouched.length} unsupported claim${vouched.length === 1 ? "" : "s"}: ${vouched.map((v) => `"${v.phrase}"`).join(", ")}.` : ""} Publishing may proceed only through the configured connection.`,
      meta: { contentItemId: item.id, approverId: ctx.user.id, vouchedClaims: vouched },
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
