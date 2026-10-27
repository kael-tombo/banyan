import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, parseJson, requireWorkspace } from "@/lib/api-utils";
import { isChannel, contentBodySchema } from "@/lib/formats";
import { NextRequest } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().trim().max(200).optional(),
  body: z.string().max(10_000).optional(),
  sourceRef: z.union([z.string().trim().max(500), z.literal("")]).optional(),
  revisionNote: z.string().trim().max(300).optional(),
});

async function load(id: string, workspaceId: string) {
  return prisma.contentItem.findFirst({ where: { id, workspaceId } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const item = await load(id, ctx.workspace.id);
  if (!item) return apiError("Content not found.", 404);
  const revisions = await prisma.contentRevision.findMany({ where: { contentItemId: item.id }, orderBy: { createdAt: "desc" } });
  const publications = await prisma.publication.findMany({ where: { contentItemId: item.id }, orderBy: { createdAt: "desc" } });
  return json({ item, revisions, publications, videoExtras: JSON.parse(item.videoExtras || "{}") });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const item = await load(id, ctx.workspace.id);
  if (!item) return apiError("Content not found.", 404);

  const parsed = await parseJson(patchSchema, await req.json());
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  // Guards: user edits never silently overwrite published/archived content.
  if (["published", "archived", "publishing"].includes(item.status)) {
    return apiError(`Archived or published content can no longer be edited (current status: ${item.status}).`, 409);
  }

  // Users may only edit while the item is draft/rejected to preserve approved copy;
  // if it is scheduled/approved (downstream confirmed), edits restart review.
  const restartFlow = ["approved", "scheduled"].includes(item.status);

  const channel = item.channel;
  const bodySchema = contentBodySchema(channel);
  const body = parsed.data.body ?? item.body;
  const bodyCheck = bodySchema.safeParse(body);
  if (!bodyCheck.success) {
    return apiError(`Body invalid: ${bodyCheck.error.issues[0]?.message}`, 400);
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title.trim() || item.title;
  if (parsed.data.body !== undefined) data.body = body;
  if (parsed.data.sourceRef !== undefined) data.sourceRef = parsed.data.sourceRef || null;
  if (parsed.data.revisionNote !== undefined && parsed.data.revisionNote !== "") data.rejectionReason = undefined;

  if (restartFlow) {
    data.status = "draft"; // editing approved content sends it back to draft by rule
    await prisma.contentItem.update({ where: { id: item.id }, data: { status: "draft" } });
  }

  const updated = await prisma.contentItem.update({
    where: { id: item.id },
    data: data as { title?: string; body?: string; sourceRef?: string | null },
  });

  // Preserved revision history: every manual edit stored.
  await prisma.contentRevision.create({
    data: {
      contentItemId: item.id,
      title: updated.title,
      body: updated.body,
      note: parsed.data.revisionNote || "Manual edit saved",
      authorType: "user",
      meta: JSON.stringify({ via: "editor" }),
    },
  });

  return json({ item: updated, flowRestarted: restartFlow });
}
