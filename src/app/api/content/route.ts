import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { recordActivity } from "@/lib/activity";
import { isChannel, isFormatFor } from "@/lib/formats";
import { NextRequest } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  channel: z.enum(["x", "linkedin", "shortvideo"]),
  format: z.string().trim().min(1).max(50),
  campaignId: z.string().optional().nullable(),
  title: z.string().trim().max(200).default(""),
  body: z.string().max(10_000).default(""),
});

export async function GET(req: NextRequest) {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const status = req.nextUrl.searchParams.get("status");
  const campaignId = req.nextUrl.searchParams.get("campaignId");
  const q = req.nextUrl.searchParams.get("q");
  const items = await prisma.contentItem.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      ...(status ? { status } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { body: { contains: q } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return json({ items });
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);

  const parsed = await readJson(req, createSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  if (!isChannel(parsed.data.channel)) return apiError("Unknown channel.", 400);
  if (parsed.data.body && !isFormatFor(parsed.data.channel, parsed.data.format)) {
    return apiError(`Format "${parsed.data.format}" is not valid for channel "${parsed.data.channel}".`, 400);
  }

  if (parsed.data.campaignId) {
    const campaign = await prisma.campaign.findFirst({ where: { id: parsed.data.campaignId, workspaceId: ctx.workspace.id } });
    if (!campaign) return apiError("Campaign not found in this workspace.", 404);
  }

  let title = parsed.data.title;
  if (!title) {
    const count = await prisma.contentItem.count({ where: { workspaceId: ctx.workspace.id, channel: parsed.data.channel } });
    title = `Untitled ${parsed.data.channel} item ${count + 1}`;
  }

  const item = await prisma.contentItem.create({
    data: {
      workspaceId: ctx.workspace.id,
      campaignId: parsed.data.campaignId ?? null,
      channel: parsed.data.channel,
      format: parsed.data.format,
      title,
      body: parsed.data.body,
      status: "draft",
    },
  });
  await prisma.contentRevision.create({
    data: { contentItemId: item.id, title: item.title, body: item.body, note: "Created", authorType: "user" },
  });
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "content_created",
    summary: `Created ${parsed.data.channel} content "${item.title}".`,
    meta: { contentItemId: item.id },
  });
  return json({ item }, 201);
}
