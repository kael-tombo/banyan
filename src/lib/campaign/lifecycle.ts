/**
 * One campaign lifecycle — US-046. Pure and unit-tested.
 *
 * Two kinds of state:
 *
 * - Decision states are moved by people and validated here: draft, analysis,
 *   strategy_generated, pending_approval, approved, and the controls pause,
 *   resume, cancel and complete. An invalid move is refused (409 at the API).
 *
 * - Work states are derived from the campaign's content, which already holds
 *   the truth through the content state machine (approved, scheduled,
 *   publishing, published, failed). They are recomputed after every content
 *   event instead of being set by hand, so they cannot drift from reality.
 */

export const LIFECYCLE_STATES = [
  "draft",
  "analysis",
  "strategy_generated",
  "pending_approval",
  "approved",
  "content_generation",
  "content_review",
  "ready_to_distribute",
  "scheduled",
  "publishing",
  "published",
  "partially_failed",
  "completed",
  "paused",
  "cancelled",
  "failed",
] as const;
export type Lifecycle = (typeof LIFECYCLE_STATES)[number];

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  draft: "Draft",
  analysis: "Analysing",
  strategy_generated: "Strategy drafted",
  pending_approval: "Waiting on approval",
  approved: "Approved",
  content_generation: "Writing content",
  content_review: "Content in review",
  ready_to_distribute: "Ready to distribute",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  partially_failed: "Partially failed",
  completed: "Completed",
  paused: "Paused",
  cancelled: "Cancelled",
  failed: "Failed",
};

/** States the content of a campaign determines. */
export const WORK_STATES: readonly Lifecycle[] = [
  "content_generation",
  "content_review",
  "ready_to_distribute",
  "scheduled",
  "publishing",
  "published",
  "partially_failed",
  "failed",
];

export const TERMINAL: readonly Lifecycle[] = ["completed", "cancelled"];

/** Moves a person may make. Work states also move by derivation. */
const TRANSITIONS: Record<Lifecycle, readonly Lifecycle[]> = {
  draft: ["analysis", "strategy_generated", "pending_approval", "approved", "cancelled"],
  analysis: ["strategy_generated", "failed", "cancelled"],
  strategy_generated: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "strategy_generated", "cancelled"],
  approved: ["content_generation", "content_review", "cancelled"],
  content_generation: ["content_review", "failed", "cancelled"],
  content_review: ["ready_to_distribute", "content_generation", "cancelled"],
  ready_to_distribute: ["scheduled", "publishing", "content_review", "cancelled"],
  scheduled: ["publishing", "ready_to_distribute", "cancelled"],
  publishing: ["published", "partially_failed", "failed", "scheduled"],
  published: ["completed", "content_review", "publishing"],
  partially_failed: ["publishing", "published", "completed", "cancelled"],
  failed: ["publishing", "content_review", "cancelled"],
  completed: [],
  paused: [],
  cancelled: [],
};

/** A campaign can be paused while it is between approval and completion. */
const PAUSABLE: readonly Lifecycle[] = ["approved", ...WORK_STATES];

export function isLifecycle(v: unknown): v is Lifecycle {
  return typeof v === "string" && (LIFECYCLE_STATES as readonly string[]).includes(v);
}

export type LifecycleAction = "submit" | "approve" | "reject" | "pause" | "resume" | "cancel" | "complete";

export const ACTION_LABEL: Record<LifecycleAction, string> = {
  submit: "Submit for approval",
  approve: "Approve campaign",
  reject: "Send back",
  pause: "Pause",
  resume: "Resume",
  cancel: "Cancel campaign",
  complete: "Mark completed",
};

/** Actions that need the approve role rather than workflow control. */
export const APPROVAL_ACTIONS: readonly LifecycleAction[] = ["approve", "reject"];

export type Decision = { ok: true; to: Lifecycle; pausedFrom?: Lifecycle | null } | { ok: false; reason: string };

export function decide(from: Lifecycle, action: LifecycleAction, pausedFrom?: string | null): Decision {
  const label = LIFECYCLE_LABEL[from].toLowerCase();
  if (action === "pause") {
    return PAUSABLE.includes(from) ? { ok: true, to: "paused", pausedFrom: from } : { ok: false, reason: `A ${label} campaign cannot be paused.` };
  }
  if (action === "resume") {
    if (from !== "paused") return { ok: false, reason: "Only a paused campaign can be resumed." };
    return { ok: true, to: isLifecycle(pausedFrom) ? pausedFrom : "approved", pausedFrom: null };
  }
  const target: Record<Exclude<LifecycleAction, "pause" | "resume">, Lifecycle> = {
    submit: "pending_approval",
    approve: "approved",
    reject: "strategy_generated",
    cancel: "cancelled",
    complete: "completed",
  };
  const to = target[action];
  if (action === "cancel" && from === "paused") return { ok: true, to, pausedFrom: null };
  return TRANSITIONS[from].includes(to) ? { ok: true, to } : { ok: false, reason: `A ${label} campaign cannot move to ${LIFECYCLE_LABEL[to].toLowerCase()}.` };
}

export function availableActions(from: Lifecycle): LifecycleAction[] {
  const all: LifecycleAction[] = ["submit", "approve", "reject", "pause", "resume", "complete", "cancel"];
  return all.filter((a) => decide(from, a).ok);
}

/**
 * The work state the campaign content implies, or null when it has no live
 * content yet. Content counts by its own status; archived items are ignored.
 */
export function deriveWorkState(statuses: string[]): Lifecycle | null {
  const live = statuses.filter((s) => s !== "archived");
  if (live.length === 0) return null;
  const n = (s: string) => live.filter((x) => x === s).length;
  if (n("draft") + n("ready_for_review") + n("rejected") > 0) return "content_review";
  if (n("publishing") > 0) return "publishing";
  if (n("scheduled") > 0) return "scheduled";
  const failed = n("failed");
  const published = n("published");
  const approved = n("approved");
  if (failed > 0) return published + approved > 0 ? "partially_failed" : "failed";
  if (approved > 0) return "ready_to_distribute";
  if (published > 0) return "published";
  return null;
}

/**
 * Whether derivation may move the campaign. Paused, cancelled and completed
 * campaigns stay where the founder put them, and nothing moves before the
 * campaign is approved.
 */
export function shouldDerive(current: Lifecycle): boolean {
  return current === "approved" || WORK_STATES.includes(current);
}

/** Generating content makes no sense while one of these holds. */
export function generationBlocked(current: Lifecycle): string | null {
  switch (current) {
    case "pending_approval":
      return "This campaign is waiting on approval. Approve it before writing content.";
    case "paused":
      return "This campaign is paused. Resume it before writing content.";
    case "cancelled":
      return "This campaign was cancelled.";
    case "completed":
      return "This campaign is completed. Start a new campaign for new content.";
    default:
      return null;
  }
}

/** The legacy status column, kept in step for older screens and filters. */
export function legacyStatus(l: Lifecycle): "draft" | "planned" | "in_progress" | "completed" | "archived" {
  if (l === "completed") return "completed";
  if (l === "cancelled") return "archived";
  if (["draft", "analysis", "strategy_generated", "pending_approval"].includes(l)) return "draft";
  if (["approved", "content_generation", "content_review", "ready_to_distribute"].includes(l)) return "planned";
  return "in_progress";
}

/** Lifecycle for a legacy status set through the old campaign PATCH. */
export function lifecycleForLegacy(status: string): Lifecycle | null {
  switch (status) {
    case "draft":
      return "draft";
    case "planned":
      return "approved";
    case "completed":
      return "completed";
    case "archived":
      return "cancelled";
    default:
      return null; // in_progress: derived from content
  }
}

/**
 * Whether a campaign holds its scheduled publications (US-048). A held
 * publication is left exactly as scheduled, with no attempt counted; the
 * maintenance sweep picks it up again once the campaign is resumed.
 */
export function holdsPublishing(current: string | null | undefined): string | null {
  if (current === "paused") return "The campaign is paused. This publication stays scheduled and runs after the campaign is resumed.";
  if (current === "cancelled") return "The campaign was cancelled, so this publication will not run.";
  return null;
}
