import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { isChannel, contentBodySchema } from "@/lib/formats";
import { NextRequest } from "next/server";
import { z } from "zod";

const videoExtrasSchema = z
  .object({
    hook: z.string().max(500).optional(),
    script: z.string().max(6000).optional(),
    scenes: z
      .array(z.object({ scene: z.string().max(500).optional(), visual: z.string().max(500).optional() }).strict())
      .max(12)
      .optional(),
    onScreenText: z.string().max(500).optional(),
    caption: z.string().max(1000).optional(),
    cta: z.string().max(500).optional(),
    // Platform adaptations: channel → copy. Keys are validated against real channels below.
    adaptations: z.record(z.string().max(6000)).optional(),
  })
  .strict()
  .optional();

const patchSchema = z.object({
  title: z.string().trim().max(200).optional(),
  body: z.string().max(10_000).optional(),
  sourceRef: z.union([z.string().trim().max(500), z.literal("")]).optional(),
  revisionNote: z.string().trim().max(300).optional(),
  videoExtras: videoExtrasSchema,
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

  const parsed = await readJson(req, patchSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  // Guards: user edits never silently overwrite published/archived content.
  if (["published", "archived", "publishing"].includes(item.status)) {
    return apiError(`Archived or published content can no longer be edited (current status: ${item.status}).`, 409);
  }

  // Users may only edit while the item is draft/rejected to preserve approved copy;
  // if it is scheduled/approved (downstream confirmed), edits restart review.
  const restartFlow = ["approved", "scheduled"].includes(item.status);

  const channel = item.channel;
  if (!isChannel(channel)) return apiError(`Unsupported channel "${channel}".`, 400);
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
  if (parsed.data.videoExtras !== undefined) {
    // Merge with the stored extras so partial updates never wipe recorded fields;
    // adaptations replace as a whole (the client sends the full map), and keys
    // are narrowed to the three real channels.
    let existing: Record<string, unknown> = {};
    try {
      const e: unknown = JSON.parse(item.videoExtras || "{}");
      if (e && typeof e === "object" && !Array.isArray(e)) existing = e as Record<string, unknown>;
    } catch {
      existing = {};
    }
    const incoming = parsed.data.videoExtras;
    const adaptations = incoming.adaptations
      ? Object.fromEntries(
          Object.entries(incoming.adaptations).filter(([k]) => ["x", "linkedin", "shortvideo"].includes(k))
        )
      : undefined;
    const merged: Record<string, unknown> = { ...existing };
    for (const [k, v] of Object.entries(incoming)) {
      if (k === "adaptations") continue;
      if (v !== undefined) merged[k] = v;
    }
    if (adaptations !== undefined) merged.adaptations = adaptations;
    data.videoExtras = JSON.stringify(merged);
  }

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
