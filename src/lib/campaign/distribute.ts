import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { enabledProviderIds, EXPORT_MODE_MESSAGE } from "@/lib/distribution/providers";
import { attemptPublication } from "@/lib/publishing/publish";
import { syncCampaignLifecycle } from "./lifecycle-service";
import { holdsPublishing } from "./lifecycle";

/**
 * Distribute a whole campaign — US-049.
 *
 * Every approved, unpublished post is attempted on its own: one failure
 * never stops the others, and each outcome is reported separately. The
 * campaign lifecycle is re-derived afterwards (partially failed when some
 * failed). Without a verified provider this refuses and points to export
 * mode, which is the live path today; it never pretends to publish.
 */

export type DistributeOutcome = { contentItemId: string; title: string; channel: string; ok: boolean; status: string; message: string };

export class DistributeError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

export async function distributeCampaign(workspaceId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
  if (!campaign) throw new DistributeError("Campaign not found.", 404, "not_found");
  const held = holdsPublishing(campaign.lifecycle);
  if (held) throw new DistributeError(held, 409, "held");
  if (!enabledProviderIds().includes("socialflow")) throw new DistributeError(EXPORT_MODE_MESSAGE, 409, "export_mode");

  const connection = await prisma.channelConnection.findFirst({ where: { workspaceId, adapter: "socialflow", status: { notIn: ["error", "removed"] } } });
  const items = await prisma.contentItem.findMany({
    where: { workspaceId, campaignId, status: "approved", approvedById: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, channel: true },
  });
  if (items.length === 0) throw new DistributeError("No approved posts are waiting to go out in this campaign.", 409, "nothing_to_publish");

  const outcomes: DistributeOutcome[] = [];
  for (const item of items) {
    try {
      const r = await attemptPublication({ contentItemId: item.id, workspaceId, connectionId: connection?.id ?? null, mode: "now" });
      outcomes.push({ contentItemId: item.id, title: item.title, channel: item.channel, ok: r.ok, status: r.status, message: r.message });
    } catch (err) {
      outcomes.push({ contentItemId: item.id, title: item.title, channel: item.channel, ok: false, status: "failed", message: err instanceof Error ? err.message.slice(0, 200) : "Unexpected error" });
    }
  }
  const lifecycle = await syncCampaignLifecycle(campaignId);
  const okCount = outcomes.filter((o) => o.ok).length;
  await recordActivity({
    workspaceId,
    type: "campaign",
    actorType: "user",
    summary: `${campaign.name}: distributed ${okCount} of ${outcomes.length} approved post${outcomes.length === 1 ? "" : "s"}${okCount < outcomes.length ? `, ${outcomes.length - okCount} did not go out` : ""}.`,
    meta: { campaignId },
  });
  return { outcomes, lifecycle };
}
