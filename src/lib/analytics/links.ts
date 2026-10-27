import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { randomSlug } from "@/lib/crypto";
import { buildTrackedUrl } from "@/lib/analytics/tracked";

export async function createTrackedLink(input: {
  workspaceId: string;
  targetUrl: string;
  channel: string;
  campaignId?: string | null;
  contentItemId?: string | null;
  campaignSlug?: string;
}) {
  const campaign = input.campaignId
    ? await prisma.campaign.findFirst({ where: { id: input.campaignId, workspaceId: input.workspaceId } })
    : null;
  const slug = randomSlug();
  const { url, utm } = buildTrackedUrl({
    target: input.targetUrl,
    slug,
    channel: input.channel,
    campaignSlug: input.campaignSlug ?? campaign?.id?.slice(-6) ?? "direct",
    contentId: input.contentItemId,
  });
  const link = await prisma.trackedLink.create({
    data: {
      workspaceId: input.workspaceId,
      campaignId: input.campaignId ?? null,
      contentItemId: input.contentItemId ?? null,
      slug,
      targetUrl: url,
      utm: JSON.stringify(utm),
    },
  });
  return { link, url, utm };
}

/** Resolve + record a click. Returns the destination to redirect to. */
export async function recordClick(slug: string): Promise<{ targetUrl: string; linkId: string; workspaceId: string; campaignId: string | null } | null> {
  const link = await prisma.trackedLink.findUnique({ where: { slug } });
  if (!link) return null;
  await prisma.trackedLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 }, lastClickAt: new Date() } });
  await recordMetricEventFor(link);
  return { targetUrl: link.targetUrl, linkId: link.id, workspaceId: link.workspaceId, campaignId: link.campaignId };
}

async function recordMetricEventFor(link: { id: string; workspaceId: string; campaignId: string | null }) {
  const { recordMetricEvent } = await import("@/lib/activity");
  await recordMetricEvent({
    workspaceId: link.workspaceId,
    type: "visit",
    campaignId: link.campaignId,
    linkId: link.id,
  });
}
