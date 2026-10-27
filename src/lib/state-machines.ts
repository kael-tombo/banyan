/**
 * Explicit workflow state machines. All transitions are enforced server-side.
 */

export const CAMPAIGN_STATUSES = ["draft", "planned", "in_progress", "completed", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["planned", "archived"],
  planned: ["in_progress", "archived"],
  in_progress: ["completed", "archived"],
  completed: ["in_progress", "archived"],
  archived: ["draft"],
};

export function canTransitionCampaign(from: string, to: string): boolean {
  if (from === to) return true; // no-op saves are allowed
  const allowed = CAMPAIGN_TRANSITIONS[from as CampaignStatus];
  return !!allowed && (allowed as readonly string[]).includes(to);
}

export const CONTENT_STATUSES = [
  "draft",
  "ready_for_review",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "rejected",
  "archived",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  draft: ["ready_for_review", "archived"],
  ready_for_review: ["approved", "rejected", "draft", "archived"],
  approved: ["scheduled", "draft", "archived"],
  scheduled: ["publishing", "approved", "failed", "archived"],
  publishing: ["published", "failed"],
  failed: ["draft", "scheduled", "publishing", "archived"],
  published: ["archived"],
  rejected: ["draft", "archived"],
  archived: [],
};

export function canTransitionContent(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = CONTENT_TRANSITIONS[from as ContentStatus];
  return !!allowed && (allowed as readonly string[]).includes(to);
}

/**
 * Export guard: which content statuses may be handed to a publishing adapter.
 * Only explicit human approval (approved/scheduled, approvedById set) qualifies.
 * This is enforced in the publishing workflow, not the UI.
 */
export function isExportableContent(item: { status: string; approvedById: string | null }): boolean {
  const ok = item.status === "approved" || item.status === "scheduled";
  return ok && !!item.approvedById;
}
