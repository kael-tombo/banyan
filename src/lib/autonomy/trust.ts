import type { AutonomyChannel, AutonomyPolicy } from "@/lib/autonomy/policy";

/**
 * Earned autonomy: the bridge from Level 1 to Level 2, channel by channel.
 *
 * Banyan reads its own track record on a channel (drafts the founder approved
 * as written, edited, rejected; claims it flagged; posts that went live or
 * failed). When the evidence clears the bar, it PROPOSES adding the channel
 * to the supervised policy, showing the evidence. It never grants itself
 * autonomy: only the founder changes the policy (policy.ts invariant).
 *
 * Only decisions a human made count. Drafts approved by the policy itself are
 * excluded, otherwise autonomy would vouch for itself.
 */

export type ReviewedDraft = {
  channel: string;
  /** approved | scheduled | publishing | published | rejected | failed */
  status: string;
  /** The founder changed the copy before approving it. */
  edited: boolean;
  /** Approved by the supervised policy, not by a person. */
  approvedByPolicy: boolean;
  /** The claims guard flagged something on the approved version. */
  flagged: boolean;
  /** Provider-confirmed publications (not manual records) and failed attempts. */
  publishedLive: boolean;
  failed: boolean;
};

export type TrustRecord = {
  channel: AutonomyChannel;
  reviewed: number;
  approvedAsWritten: number;
  edited: number;
  rejected: number;
  flagged: number;
  publishedLive: number;
  failed: number;
};

/** The bar a channel must clear before Banyan proposes supervising it. Deliberately strict. */
export const TRUST_BAR = {
  window: 10, // the latest decisions that count
  minReviewed: 5,
  minAsWrittenShare: 0.8,
  maxRejected: 0,
  maxFlagged: 0,
  minPublishedLive: 2,
  maxFailed: 0,
} as const;

export function trustRecord(channel: AutonomyChannel, drafts: ReviewedDraft[]): TrustRecord {
  const human = drafts.filter((d) => d.channel === channel && !d.approvedByPolicy).slice(0, TRUST_BAR.window);
  const approved = human.filter((d) => d.status !== "rejected");
  return {
    channel,
    reviewed: human.length,
    approvedAsWritten: approved.filter((d) => !d.edited).length,
    edited: approved.filter((d) => d.edited).length,
    rejected: human.filter((d) => d.status === "rejected").length,
    flagged: approved.filter((d) => d.flagged).length,
    publishedLive: human.filter((d) => d.publishedLive).length,
    failed: human.filter((d) => d.failed).length,
  };
}

export type TrustCheck = { label: string; met: boolean };
export type TrustVerdict = {
  channel: AutonomyChannel;
  record: TrustRecord;
  checks: TrustCheck[];
  /** supervised already | ready to propose | keep approving each */
  state: "supervised" | "ready" | "not_yet";
  summary: string;
};

const NAME: Record<AutonomyChannel, string> = { linkedin: "LinkedIn", x: "X" };

export function trustVerdict(record: TrustRecord, policy: AutonomyPolicy): TrustVerdict {
  const share = record.reviewed ? record.approvedAsWritten / record.reviewed : 0;
  const checks: TrustCheck[] = [
    { label: `${record.reviewed} of ${TRUST_BAR.minReviewed} drafts reviewed by you`, met: record.reviewed >= TRUST_BAR.minReviewed },
    { label: `${Math.round(share * 100)}% approved as written (needs ${TRUST_BAR.minAsWrittenShare * 100}%)`, met: record.reviewed > 0 && share >= TRUST_BAR.minAsWrittenShare },
    { label: record.rejected ? `${record.rejected} rejected recently` : "None rejected recently", met: record.rejected <= TRUST_BAR.maxRejected },
    { label: record.flagged ? `${record.flagged} approved with a flagged claim` : "No flagged claims approved", met: record.flagged <= TRUST_BAR.maxFlagged },
    { label: `${record.publishedLive} of ${TRUST_BAR.minPublishedLive} posts confirmed live`, met: record.publishedLive >= TRUST_BAR.minPublishedLive },
    { label: record.failed ? `${record.failed} failed to publish` : "No failed posts", met: record.failed <= TRUST_BAR.maxFailed },
  ];
  const name = NAME[record.channel];
  if (policy.level === "supervised" && policy.channels.includes(record.channel)) {
    return { channel: record.channel, record, checks, state: "supervised", summary: `${name} is already supervised: Banyan approves routine drafts within your policy.` };
  }
  if (checks.every((c) => c.met)) {
    return {
      channel: record.channel,
      record,
      checks,
      state: "ready",
      summary: `You approved ${record.approvedAsWritten} of your last ${record.reviewed} ${name} drafts as written, and ${record.publishedLive} went live without a failure. Banyan could approve routine ${name} drafts within your policy; anything unusual would still come to you.`,
    };
  }
  const missing = checks.filter((c) => !c.met).length;
  return { channel: record.channel, record, checks, state: "not_yet", summary: `Keep approving each ${name} draft: ${missing} of ${checks.length} conditions are not met yet.` };
}

/** The policy the founder would apply by accepting a proposal: the same policy, plus this channel. */
export function proposedPolicy(policy: AutonomyPolicy, channel: AutonomyChannel) {
  return {
    level: "supervised" as const,
    channels: [...new Set([...(policy.level === "supervised" ? policy.channels : []), channel])],
    maxPerDay: policy.maxPerDay,
    quietHours: policy.quietHours,
    blackoutDates: policy.blackoutDates,
    autoPublish: policy.level === "supervised" ? policy.autoPublish : false,
  };
}
