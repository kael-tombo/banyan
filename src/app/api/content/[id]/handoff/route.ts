import { prisma } from "@/lib/db";
import { apiError, json, requireWorkspace } from "@/lib/api-utils";
import { buildSocialFlowHandoff, socialflowHandoffToText } from "@/lib/publishing/socialflow";
import { NextRequest } from "next/server";

/**
 * SocialFlow.ai manual handoff: returns the approved content formatted as a
 * copy-ready package for execution in an external tool. Read-only — this
 * never publishes anything and never calls any provider. The live URL is
 * recorded afterwards through POST /api/content/[id]/publish (mode "manual").
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;

  const item = await prisma.contentItem.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
  });
  if (!item) return apiError("Content not found.", 404);

  const handoff = buildSocialFlowHandoff({
    id: item.id,
    title: item.title,
    channel: item.channel,
    format: item.format,
    body: item.body,
    videoExtras: item.videoExtras,
    scheduledFor: item.scheduledFor,
  });

  return json({
    handoff,
    text: socialflowHandoffToText(handoff),
    approved: item.status === "approved" || item.status === "scheduled",
    itemStatus: item.status,
  });
}
