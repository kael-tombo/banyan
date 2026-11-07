import { prisma } from "@/lib/db";
import { createTrackedLink } from "@/lib/analytics/links";
import { buildSocialFlowHandoff, socialflowHandoffToText, type SocialFlowHandoff } from "@/lib/publishing/socialflow";
import { isExportableContent } from "@/lib/state-machines";

/**
 * Export mode — US-034. The live distribution path while SocialFlow.ai has no
 * verifiable API: an approved post becomes a ready-to-publish package that
 * the founder publishes with any tool, then records the live URL.
 *
 * Each exported post gets its own tracked link (created once, reused after),
 * so visits and signups from a manually published post still trace back to
 * it. The package never claims the post is published; only a recorded live
 * URL does that, and it is stored as a manual publication.
 */

export type ExportPackage = SocialFlowHandoff & {
  contentItemId: string;
  trackedLink: string | null;
  trackedLinkNote: string;
};

export type ExportResult = { ok: true; pkg: ExportPackage; text: string; markdown: string } | { ok: false; status: number; message: string };

type ExportableItem = {
  id: string;
  workspaceId: string;
  campaignId: string | null;
  title: string;
  channel: string;
  format: string;
  body: string;
  status: string;
  approvedById?: string | null;
  videoExtras: string | null;
  scheduledFor: Date | null;
};

/** The tracked link for this post: reuse the existing one, or create it once. */
export async function ensureTrackedLink(item: ExportableItem, productUrl: string | null | undefined): Promise<string | null> {
  const existing = await prisma.trackedLink.findFirst({ where: { workspaceId: item.workspaceId, contentItemId: item.id }, orderBy: { createdAt: "asc" } });
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (existing) return `${base}/t/${existing.slug}`;
  if (!productUrl) return null;
  const { link } = await createTrackedLink({
    workspaceId: item.workspaceId,
    targetUrl: productUrl,
    channel: item.channel,
    campaignId: item.campaignId,
    contentItemId: item.id,
  });
  return `${base}/t/${link.slug}`;
}

/** Pure: package + plain text + Markdown for one item. */
export function renderExport(item: ExportableItem, trackedLink: string | null): { pkg: ExportPackage; text: string; markdown: string } {
  const handoff = buildSocialFlowHandoff({
    id: item.id,
    title: item.title,
    channel: item.channel,
    format: item.format,
    body: item.body,
    videoExtras: item.videoExtras,
    scheduledFor: item.scheduledFor,
  });
  const trackedLinkNote = trackedLink
    ? "Put this link in the post (for X threads, in the last post). Visits and signups through it are attributed to this post."
    : "No tracked link: add your product URL in Product & Audience so Banyan can attribute visits to this post.";
  const pkg: ExportPackage = { ...handoff, contentItemId: item.id, trackedLink, trackedLinkNote };

  const linkBlock = trackedLink ? `\nTracked link: ${trackedLink}\n${trackedLinkNote}\n` : `\n${trackedLinkNote}\n`;
  const text = `${socialflowHandoffToText(handoff)}\n${linkBlock}`;
  const markdown = [
    `## ${item.title}`,
    "",
    `- Channel: ${item.channel} · Format: ${item.format}`,
    trackedLink ? `- Tracked link: ${trackedLink}` : `- Tracked link: none (${trackedLinkNote})`,
    item.scheduledFor ? `- Suggested time: ${item.scheduledFor.toISOString()}` : "",
    "",
    "### Copy",
    "",
    "```text",
    item.body,
    "```",
    "",
    "### Checklist",
    "",
    ...handoff.checklist.map((c) => `- [ ] ${c.replace(/^\d+\.\s*/, "")}`),
    "",
    `_Exported from Banyan · content ${item.id} · you publish this; record the live URL in Banyan afterwards._`,
    "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
  return { pkg, text, markdown };
}

/** Export one approved item for its workspace. */
export async function exportContentItem(workspaceId: string, contentItemId: string): Promise<ExportResult> {
  const item = await prisma.contentItem.findFirst({ where: { id: contentItemId, workspaceId } });
  if (!item) return { ok: false, status: 404, message: "Content not found." };
  if (!isExportableContent(item)) {
    return { ok: false, status: 409, message: `Only approved content can be exported for publishing (this item is ${item.status}).` };
  }
  const profile = await prisma.productProfile.findUnique({ where: { workspaceId }, select: { website: true } });
  const trackedLink = await ensureTrackedLink(item, profile?.website);
  return { ok: true, ...renderExport(item, trackedLink) };
}

/** Export every approved, not-yet-published item of a campaign. */
export async function exportCampaign(
  workspaceId: string,
  campaignId: string,
): Promise<{ ok: true; count: number; markdown: string; items: ExportPackage[] } | { ok: false; status: number; message: string }> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { id: true, name: true } });
  if (!campaign) return { ok: false, status: 404, message: "Campaign not found." };
  const items = await prisma.contentItem.findMany({ where: { workspaceId, campaignId }, orderBy: { createdAt: "asc" } });
  const exportable = items.filter((i) => isExportableContent(i) && i.status !== "published");
  const profile = await prisma.productProfile.findUnique({ where: { workspaceId }, select: { website: true } });
  const rendered = [];
  for (const item of exportable) {
    const link = await ensureTrackedLink(item, profile?.website);
    rendered.push(renderExport(item, link));
  }
  const skipped = items.length - exportable.length;
  const markdown = [
    `# ${campaign.name} — export`,
    "",
    `${rendered.length} approved post(s) ready to publish.${skipped ? ` ${skipped} item(s) skipped: not approved yet, or already published.` : ""}`,
    "",
    ...rendered.map((r) => r.markdown),
  ].join("\n");
  return { ok: true, count: rendered.length, markdown, items: rendered.map((r) => r.pkg) };
}
