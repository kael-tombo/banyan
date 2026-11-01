import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { recordActivity } from "@/lib/activity";
import { approvalBlockers, approvalState } from "@/lib/product/profile-review";
import { NextRequest } from "next/server";

/** Approve the current version of the product profile (US-023). Requires the approve role. */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "approve");
  if (forbidden) return apiError(forbidden, 403);

  const profile = await prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } });
  if (!profile) return apiError("There is no product profile to approve yet.", 404);
  const blockers = approvalBlockers(profile);
  if (blockers.length) return json({ error: blockers.join(" "), blockers }, 422);
  if (profile.approvedAt) return json({ version: profile.version, approval: approvalState(profile) });

  const approved = await prisma.productProfile.update({
    where: { workspaceId: ctx.workspace.id },
    data: { approvedAt: new Date(), approvedById: ctx.user.id },
  });
  await recordActivity({ workspaceId: ctx.workspace.id, type: "profile", summary: `Product profile version ${approved.version} approved.`, meta: { version: approved.version } });
  return json({ version: approved.version, approval: approvalState(approved) });
}
