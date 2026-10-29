/**
 * Campaign pipeline derivation — the five-stage view of a campaign
 * (Prepare → Create → Review → Publish → Learn), computed from recorded
 * state only. Every boolean traces to a real row; nothing is estimated.
 *
 * Also here: the pre-publish launch checklist (attribution, approval,
 * connection) and the coordinator "attention" items. All pure functions so
 * the UI stays a thin renderer and the logic is unit-testable.
 */

export type CampaignStageKey = "prepare" | "create" | "review" | "publish" | "learn";
export type StageState = "complete" | "active" | "upcoming";

export interface CampaignStage {
  key: CampaignStageKey;
  label: string;
  hint: string;
  state: StageState;
  detail: string;
}

export interface CampaignPipelineInput {
  status: string;
  contentTotal: number;
  /** items with status approved | scheduled | publishing | published */
  contentApproved: number;
  /** items with status scheduled | publishing | published */
  contentScheduled: number;
  contentPublished: number;
  metricsRecorded: number;
  completedAt: Date | null;
}

const STAGE_ORDER: CampaignStageKey[] = ["prepare", "create", "review", "publish", "learn"];

const STAGE_META: Record<CampaignStageKey, { label: string; hint: string }> = {
  prepare: { label: "Prepare", hint: "Brief & plan" },
  create: { label: "Create", hint: "Content & assets" },
  review: { label: "Review", hint: "Approval & QA" },
  publish: { label: "Publish", hint: "Go live" },
  learn: { label: "Learn", hint: "Measure impact" },
};

export function computeCampaignPipeline(input: CampaignPipelineInput): {
  stages: CampaignStage[];
  current: CampaignStageKey | null;
  done: boolean;
} {
  const complete: Record<CampaignStageKey, boolean> = {
    // The brief fields are required at creation — a campaign always carries
    // its brief, so "prepare" is complete by definition.
    prepare: true,
    create: input.contentTotal > 0,
    review: input.contentApproved > 0,
    publish: input.contentPublished > 0,
    learn: input.metricsRecorded > 0 || input.completedAt !== null,
  };

  const details: Record<CampaignStageKey, string> = {
    prepare: "Brief, audience and CTA recorded",
    create: input.contentTotal > 0
      ? `${input.contentTotal} content item${input.contentTotal === 1 ? "" : "s"} drafted`
      : "No content drafted yet",
    review: input.contentTotal > 0
      ? `${input.contentApproved} of ${input.contentTotal} item${input.contentTotal === 1 ? "" : "s"} approved`
      : "Nothing submitted for review yet",
    publish: input.contentPublished > 0
      ? `${input.contentPublished} published${input.contentScheduled > 0 ? ` · ${input.contentScheduled} scheduled` : ""}`
      : input.contentScheduled > 0
        ? `${input.contentScheduled} scheduled — go-live pending`
        : "Nothing scheduled or published yet",
    learn: input.metricsRecorded > 0
      ? `${input.metricsRecorded} metric entr${input.metricsRecorded === 1 ? "y" : "ies"} recorded`
      : input.completedAt
        ? "Campaign completed — record what it taught you"
        : "Record metrics after launch to close the loop",
  };

  const firstOpen = STAGE_ORDER.find((key) => !complete[key]) ?? null;

  const stages: CampaignStage[] = STAGE_ORDER.map((key) => ({
    key,
    ...STAGE_META[key],
    state: complete[key] ? "complete" : key === firstOpen ? "active" : "upcoming",
    detail: details[key],
  }));

  return { stages, current: firstOpen, done: firstOpen === null };
}

/**
 * A tracked link counts as UTM-tagged when its recorded utm JSON carries any
 * key, or its target URL already contains utm_ parameters.
 */
export function hasUtmTags(utmJson: string, targetUrl: string): boolean {
  try {
    const parsed: unknown = JSON.parse(utmJson || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (Object.keys(parsed as Record<string, unknown>).length > 0) return true;
    }
  } catch {
    // malformed JSON — fall through to the URL check
  }
  return /utm_[a-z]+=/i.test(targetUrl || "");
}

export interface CampaignChecklistItem {
  key: string;
  label: string;
  done: boolean;
  hint: string;
}

export interface LaunchChecklistInput {
  trackedLinkCount: number;
  utmTaggedLinkCount: number;
  approvedItems: number;
  liveConnections: number;
}

/** Pre-publish readiness: the four things that make a launch attributable. */
export function computeLaunchChecklist(input: LaunchChecklistInput): {
  items: CampaignChecklistItem[];
  ready: boolean;
} {
  const items: CampaignChecklistItem[] = [
    {
      key: "tracked-link",
      label: "Tracked link attached",
      done: input.trackedLinkCount > 0,
      hint: "Attribution needs a /t/ link on the destination.",
    },
    {
      key: "utm-tags",
      label: "UTM tags present",
      done: input.utmTaggedLinkCount > 0,
      hint: "utm_source, utm_medium, utm_campaign — or any utm_ parameter on the target URL.",
    },
    {
      key: "content-approved",
      label: "Content approved",
      done: input.approvedItems > 0,
      hint: "Approval is enforced by the publishing pipeline — nothing exports without it.",
    },
    {
      key: "publishing-connected",
      label: "Publishing connected",
      done: input.liveConnections > 0,
      hint: "Connect a publishing provider, or record manual publications after posting.",
    },
  ];
  return { items, ready: items.every((i) => i.done) };
}

export interface CampaignAttentionItem {
  key: string;
  label: string;
  detail: string;
  href: string;
  tone: "warm" | "clay" | "forest";
}

/** Coordinator panel: what (if anything) needs the founder's attention. */
export function computeCampaignAttention(input: {
  itemsInReview: number;
  tasksWaitingApproval: number;
  tasksBlocked: number;
  scheduledCount: number;
  publishedCount: number;
  checklistReady: boolean;
}): CampaignAttentionItem[] {
  const items: CampaignAttentionItem[] = [];
  if (input.tasksBlocked > 0) {
    items.push({
      key: "blocked",
      label: `${input.tasksBlocked} blocked task${input.tasksBlocked === 1 ? "" : "s"}`,
      detail: "Execution is paused on these until the blocker clears.",
      href: "/app/approvals",
      tone: "clay",
    });
  }
  if (input.itemsInReview > 0) {
    items.push({
      key: "review",
      label: `${input.itemsInReview} item${input.itemsInReview === 1 ? "" : "s"} awaiting your review`,
      detail: "Approve the copy and claims — publishing waits for it.",
      href: "/app/approvals",
      tone: "warm",
    });
  }
  if (input.tasksWaitingApproval > 0) {
    items.push({
      key: "gate",
      label: "Approval gate open",
      detail: "An agent is holding at the approval gate for this campaign.",
      href: "/app/approvals",
      tone: "warm",
    });
  }
  if (!input.checklistReady && input.publishedCount === 0 && input.scheduledCount > 0) {
    items.push({
      key: "checklist",
      label: "Pre-publish checklist incomplete",
      detail: "Scheduled assets may publish without full attribution. Close the checklist below.",
      href: "#checklist",
      tone: "clay",
    });
  }
  if (items.length === 0) {
    items.push({
      key: "clear",
      label: input.publishedCount > 0 ? "All clear — campaign is live" : "Nothing needs your attention",
      detail: input.publishedCount > 0
        ? `${input.publishedCount} item${input.publishedCount === 1 ? "" : "s"} published from this campaign.`
        : "The coordinator flags whatever blocks progress here, as it appears.",
      href: "#checklist",
      tone: "forest",
    });
  }
  return items;
}
