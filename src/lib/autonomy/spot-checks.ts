import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { syncCampaignLifecycle } from "@/lib/campaign/lifecycle-service";
import { cancelPendingPublication } from "@/lib/publishing/status-sync";
import { autonomyEvents } from "@/lib/autonomy/service";
import type { SpotCheckVerdict } from "@/lib/autonomy/trust";

/**
 * Spot checks: the founder's after-the-fact review of drafts the supervised
 * policy approved on its own (a sample, see spotCheckDue in trust.ts).
 *
 * Each verdict is a human decision and feeds the channel's trust record, so
 * supervision keeps being earned. "Shouldn't go out" also stops the post when
 * it has not gone out yet: the schedule is cancelled (in SocialFlow first if it
 * already holds the post) and the draft is marked rejected.
 */

export const SPOT_CHECK_ACTIVITY = "autonomy_spotcheck";
const WINDOW_MS = 30 * 86_400_000;

export type SpotCheckItem = {
  contentItemId: string;
  channel: string;
  title: string;
  body: string;
  status: string;
  scheduledFor: Date | null;
  approvedAt: Date;
  policyVersion: number | null;
};

/** Verdicts recorded so far, by content item. */
export async function spotCheckVerdicts(workspaceId: string, since: Date): Promise<Map<string, SpotCheckVerdict>> {
  const rows = await prisma.activityEvent.findMany({
    where: { workspaceId, type: SPOT_CHECK_ACTIVITY, createdAt: { gte: since } },
    select: { meta: true },
  });
  const out = new Map<string, SpotCheckVerdict>();
  for (const r of rows) {
    try {
      const m = JSON.parse(r.meta || "{}") as { contentItemId?: string; verdict?: SpotCheckVerdict };
      if (m.contentItemId && m.verdict) out.set(m.contentItemId, m.verdict);
    } catch {
      /* ignore malformed rows */
    }
  }
  return out;
}

/** Policy-approved drafts picked for a spot check that the founder has not judged yet, oldest first. */
export async function pendingSpotChecks(workspaceId: string, now: Date = new Date()): Promise<SpotCheckItem[]> {
  const since = new Date(now.getTime() - WINDOW_MS);
  const [events, verdicts] = await Promise.all([autonomyEvents(workspaceId, since, 1000), spotCheckVerdicts(workspaceId, since)]);
  const picked = events.filter((e) => e.decision === "auto_approved" && e.spotCheck && e.contentItemId && !verdicts.has(e.contentItemId));
  if (!picked.length) return [];
  const items = await prisma.contentItem.findMany({
    where: { workspaceId, id: { in: picked.map((e) => e.contentItemId!) } },
    select: { id: true, channel: true, title: true, body: true, status: true, scheduledFor: true, approvedAt: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  return picked
    .flatMap((e) => {
      const i = byId.get(e.contentItemId!);
      // A draft a person has since rejected or sent back for edits has been reviewed already.
      if (!i || !["approved", "scheduled", "publishing", "published", "failed"].includes(i.status)) return [];
      return [{ contentItemId: i.id, channel: i.channel, title: i.title, body: i.body, status: i.status, scheduledFor: i.scheduledFor, approvedAt: i.approvedAt ?? e.createdAt, policyVersion: e.policyVersion ?? null }];
    })
    .sort((a, b) => a.approvedAt.getTime() - b.approvedAt.getTime());
}

export type SpotCheckResult =
  | { ok: true; verdict: SpotCheckVerdict; stopped: boolean; message: string }
  | { ok: false; status: number; message: string };

export async function recordSpotCheck(
  workspaceId: string,
  user: { id: string; name: string },
  contentItemId: string,
  verdict: SpotCheckVerdict,
): Promise<SpotCheckResult> {
  const pending = (await pendingSpotChecks(workspaceId)).find((p) => p.contentItemId === contentItemId);
  if (!pending) return { ok: false, status: 404, message: "That post is not waiting for a spot check (already judged, or not one the policy approved)." };

  let stopped = false;
  let message = verdict === "as_written" ? "Recorded: you would have approved it as written." : "Recorded: you would have changed it. It counts as an edit in the channel's record.";
  if (verdict === "stop") {
    if (pending.status === "published") {
      message = "Recorded. It is already live, so Banyan cannot take it back: remove it on the platform if it should not stay up.";
    } else if (pending.status === "publishing") {
      return { ok: false, status: 409, message: "It is being published right now. Try again in a minute; if it went out, your verdict is still recorded then." };
    } else {
      const cancelled = await cancelPendingPublication(contentItemId, workspaceId, user.id);
      if (!cancelled.ok) return { ok: false, status: cancelled.status, message: cancelled.message };
      // Back to draft with the policy's approval withdrawn (the content state machine's way out of approved/scheduled).
      const item = await prisma.contentItem.update({
        where: { id: contentItemId },
        data: { status: "draft", scheduledFor: null, approvedById: null, approvedAt: null, rejectionReason: `Stopped on spot check by ${user.name}.` },
        select: { campaignId: true },
      });
      await syncCampaignLifecycle(item.campaignId);
      stopped = true;
      message = "Stopped: it will not go out. The draft is back in your drafts with the approval withdrawn.";
    }
  }

  const label = { as_written: "approved as written", would_edit: "would have changed it", stop: "should not go out" }[verdict];
  await recordActivity({
    workspaceId,
    type: SPOT_CHECK_ACTIVITY,
    actorType: "user",
    actorSummary: user.name,
    summary: `Spot check on "${pending.title}": ${label}${stopped ? " (stopped before publishing)" : ""}.`,
    meta: { contentItemId, verdict, channel: pending.channel, title: pending.title, policyVersion: pending.policyVersion, stopped },
  });
  return { ok: true, verdict, stopped, message };
}
