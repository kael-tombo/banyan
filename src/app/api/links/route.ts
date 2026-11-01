import { requireRole } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, guardRate, readJson } from "@/lib/api-utils";
import { createTrackedLink } from "@/lib/analytics/links";
import { trackedLinkUrl } from "@/lib/analytics/tracked";
import { NextRequest } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  targetUrl: z.string().url().max(500),
  channel: z.enum(["x", "linkedin", "shortvideo", "direct"]),
  campaignId: z.string().nullable().optional(),
  contentItemId: z.string().nullable().optional(),
});

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const links = await prisma.trackedLink.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return json({ links: links.map((l) => ({ ...l, url: trackedLinkUrl(l.slug) })) });
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "links", 30, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const parsed = await readJson(req, createSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  if (parsed.data.campaignId) {
    const campaign = await prisma.campaign.findFirst({ where: { id: parsed.data.campaignId, workspaceId: ctx.workspace.id } });
    if (!campaign) return apiError("Campaign not found in this workspace.", 404);
  }

  const { link, url } = await createTrackedLink({
    workspaceId: ctx.workspace.id,
    targetUrl: parsed.data.targetUrl,
    channel: parsed.data.channel,
    campaignId: parsed.data.campaignId ?? null,
    contentItemId: parsed.data.contentItemId ?? null,
  });
  return json({ link: { ...link, url }, url }, 201);
}
