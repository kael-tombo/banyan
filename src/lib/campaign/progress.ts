/**
 * Campaign progress at a glance — US-047. Pure.
 *
 * Counts posts by where they are, and names the one next step: what Banyan
 * has done and what it needs from the founder. Counts come from content
 * statuses; nothing is estimated.
 */

export type CampaignCounts = {
  total: number;
  review: number;
  ready: number;
  scheduled: number;
  publishing: number;
  published: number;
  failed: number;
};

export function campaignCounts(statuses: string[]): CampaignCounts {
  const live = statuses.filter((s) => s !== "archived");
  const n = (...s: string[]) => live.filter((x) => s.includes(x)).length;
  return {
    total: live.length,
    review: n("draft", "ready_for_review", "rejected"),
    ready: n("approved"),
    scheduled: n("scheduled"),
    publishing: n("publishing"),
    published: n("published"),
    failed: n("failed"),
  };
}

export type NextStep = { label: string; detail: string; kind: "write" | "review" | "post" | "publish" | "fix" | "wait" | "measure" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function nextCampaignStep(c: CampaignCounts, mode: "socialflow" | "export"): NextStep {
  if (c.total === 0) return { kind: "write", label: "Write drafts from the strategy", detail: "Banyan drafts one post per channel and format in the approved strategy." };
  if (c.failed > 0) return { kind: "fix", label: `Fix ${plural(c.failed, "post")} that did not go out`, detail: "Each failed post shows the provider's reason. Edit or retry it; the others are unaffected." };
  if (c.review > 0) return { kind: "review", label: `Review ${plural(c.review, "draft")}`, detail: "Banyan wrote them from your strategy. Nothing goes out until you approve it." };
  if (c.ready > 0) {
    return mode === "socialflow"
      ? { kind: "publish", label: `Publish ${plural(c.ready, "approved post")}`, detail: "Banyan sends each one through SocialFlow.ai and records what the provider confirms." }
      : { kind: "post", label: `Post ${plural(c.ready, "approved post")}`, detail: "Copy each one from the posting kit, post it, then paste its live link back so visits and signups trace to it." };
  }
  if (c.scheduled + c.publishing > 0) return { kind: "wait", label: "Posts are on their way", detail: `${plural(c.scheduled + c.publishing, "post")} scheduled or publishing. Banyan records each result as it lands.` };
  return { kind: "measure", label: "Watch the results come in", detail: "Every post carries a tracked link. Visits and signups appear here as they are recorded; a zero stays a zero." };
}
