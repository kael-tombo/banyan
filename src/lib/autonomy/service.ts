import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { parseFlags } from "@/lib/content/checks";
import { syncCampaignLifecycle } from "@/lib/campaign/lifecycle-service";
import { attemptPublication, UNUSABLE_CONNECTION_STATUSES } from "@/lib/publishing/publish";
import { providerFor } from "@/lib/distribution/providers";
import {
  decideApproval, describePolicy, isSupervised, nextSlot, parsePolicy,
  type AutonomyEvent, type AutonomyPolicy, type PolicyInput,
} from "@/lib/autonomy/policy";

/**
 * Supervised autonomy, applied. Two entry points:
 *
 *   setPolicy       — a human (owner/member) writes the mandate; the system never calls it.
 *   superviseDrafts — after the creator writes drafts, approve what the policy
 *                     allows, schedule it when the policy says so and a
 *                     verified connection exists, and escalate the rest with
 *                     the reason. Every decision is an "autonomy" activity row.
 */

export const AUTONOMY_ACTIVITY = "autonomy";
export const POLICY_ACTIVITY = "autonomy_policy";

export async function getPolicy(workspaceId: string): Promise<AutonomyPolicy> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { autonomyPolicy: true } });
  return parsePolicy(ws?.autonomyPolicy);
}

export async function setPolicy(workspaceId: string, user: { id: string; name: string }, input: PolicyInput): Promise<AutonomyPolicy> {
  const before = await getPolicy(workspaceId);
  const next: AutonomyPolicy = {
    ...input,
    channels: [...new Set(input.channels)],
    blackoutDates: [...new Set(input.blackoutDates)].sort(),
    version: before.version + 1,
    setById: user.id,
    setAt: new Date().toISOString(),
  };
  await prisma.workspace.update({ where: { id: workspaceId }, data: { autonomyPolicy: JSON.stringify(next) } });
  await recordActivity({
    workspaceId,
    type: POLICY_ACTIVITY,
    actorType: "user",
    actorSummary: user.name,
    summary: `${user.name} set the autonomy policy to v${next.version}. ${describePolicy(next)}`,
    meta: { before, after: next },
  });
  return next;
}

async function logDecision(workspaceId: string, e: Omit<AutonomyEvent, "createdAt"> & { contentItemId: string; policyVersion: number }) {
  const verb = { auto_approved: "approved", escalated: "left for you", scheduled: "scheduled", not_scheduled: "approved but not scheduled" }[e.decision];
  await recordActivity({
    workspaceId,
    type: AUTONOMY_ACTIVITY,
    actorType: "ai",
    actorSummary: `policy v${e.policyVersion}`,
    summary: `"${e.title}" ${verb}${e.scheduledFor ? ` for ${e.scheduledFor}` : ""}: ${e.reasons.join(" ")}`,
    meta: e,
  });
}

export type SupervisionResult = { approved: number; escalated: number; scheduled: number };

export async function superviseDrafts(workspaceId: string, campaignId: string): Promise<SupervisionResult> {
  const result: SupervisionResult = { approved: 0, escalated: 0, scheduled: 0 };
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { agentsPausedAt: true, autonomyPolicy: true, timeZone: true } });
  if (!ws || ws.agentsPausedAt) return result;
  const policy = parsePolicy(ws.autonomyPolicy);
  if (!isSupervised(policy) || !policy.setById) return result;
  const approverId = policy.setById;

  const drafts = await prisma.contentItem.findMany({ where: { workspaceId, campaignId, status: "ready_for_review" }, orderBy: { createdAt: "asc" } });
  for (const item of drafts) {
    const providerPublished = await prisma.publication.count({ where: { status: "published", manual: false, contentItem: { workspaceId, channel: item.channel } } });
    const meta = (() => { try { return JSON.parse(item.generationMeta || "{}") as { isFallback?: boolean }; } catch { return {}; } })();
    const decision = decideApproval(
      { channel: item.channel, status: item.status, flags: parseFlags(item.checks), isFallback: Boolean(meta.isFallback), channelHasPublished: providerPublished > 0 },
      policy
    );
    const base = { contentItemId: item.id, channel: item.channel, title: item.title, policyVersion: policy.version };

    if (!decision.auto) {
      result.escalated++;
      await logDecision(workspaceId, { ...base, decision: "escalated", reasons: decision.reasons });
      continue;
    }

    // Approve exactly this revision, attributed to the founder whose policy allowed it.
    const approved = await prisma.contentItem.updateMany({
      where: { id: item.id, status: "ready_for_review", body: item.body },
      data: { status: "approved", approvedById: approverId, approvedAt: new Date(), rejectionReason: null },
    });
    if (approved.count !== 1) continue; // edited or decided by a human meanwhile
    result.approved++;
    await logDecision(workspaceId, { ...base, decision: "auto_approved", reasons: decision.reasons });

    if (!policy.autoPublish) continue;
    const connection = await prisma.channelConnection.findFirst({
      where: { workspaceId, channel: item.channel, status: { notIn: UNUSABLE_CONNECTION_STATUSES } },
    });
    if (!connection || !providerFor(connection.adapter)) {
      await logDecision(workspaceId, { ...base, decision: "not_scheduled", reasons: [`No verified ${item.channel} connection, so it waits for you to publish or export it.`] });
      continue;
    }
    const taken = await prisma.publication.findMany({
      where: {
        status: { in: ["scheduled", "attempting", "published"] },
        contentItem: { workspaceId, channel: item.channel },
        OR: [{ scheduledFor: { gte: new Date(Date.now() - 2 * 86_400_000) } }, { publishedAt: { gte: new Date(Date.now() - 2 * 86_400_000) } }],
      },
      select: { scheduledFor: true, publishedAt: true },
    });
    const slot = nextSlot(new Date(), policy, ws.timeZone, taken.map((t) => (t.scheduledFor ?? t.publishedAt) as Date).filter(Boolean));
    if (!slot) {
      await logDecision(workspaceId, { ...base, decision: "not_scheduled", reasons: ["No slot fits your policy in the next 14 days."] });
      continue;
    }
    const res = await attemptPublication({ contentItemId: item.id, workspaceId, connectionId: connection.id, mode: "schedule", scheduledFor: slot });
    if (res.ok) {
      result.scheduled++;
      await logDecision(workspaceId, { ...base, decision: "scheduled", reasons: ["The next slot your policy allows."], scheduledFor: slot.toISOString() });
    } else {
      await logDecision(workspaceId, { ...base, decision: "not_scheduled", reasons: [res.message] });
    }
  }
  await syncCampaignLifecycle(campaignId);
  return result;
}

/** The autonomy log for the digest and the decision list, newest first. */
export async function autonomyEvents(workspaceId: string, since: Date, take = 200): Promise<(AutonomyEvent & { contentItemId?: string; policyVersion?: number })[]> {
  const rows = await prisma.activityEvent.findMany({
    where: { workspaceId, type: AUTONOMY_ACTIVITY, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take,
    select: { createdAt: true, meta: true },
  });
  return rows.flatMap((r) => {
    try {
      const m = JSON.parse(r.meta || "{}") as Omit<AutonomyEvent, "createdAt"> & { contentItemId?: string; policyVersion?: number };
      return m.decision ? [{ ...m, createdAt: r.createdAt, reasons: m.reasons ?? [] }] : [];
    } catch {
      return [];
    }
  });
}
