import type { CampaignCounts } from "@/lib/campaign/progress";

/**
 * The launch path — the MVP promise as five steps, computed from records.
 * Pure and unit-tested.
 *
 *   Product → Strategy → Content → Distribute → Measure
 *
 * Each step says what Banyan has done or is doing, what it needs from the
 * founder, and offers one action. The first step that is not done is the
 * current one; nothing later is shown as started.
 */

export type StepId = "product" | "strategy" | "content" | "distribute" | "measure";
export type StepState = "done" | "current" | "upcoming";

export type JourneyStep = {
  id: StepId;
  title: string;
  state: StepState;
  /** One line: what happened, or what Banyan is waiting on. */
  line: string;
  /** Whether the founder is the one who must act now. */
  waitingOnYou: boolean;
  action?: { label: string; href: string };
};

export type JourneyInput = {
  profile: { exists: boolean; approvedVersion: number | null; needsApproval: boolean; fromWebsite: boolean };
  strategy: { proposedVersion: number | null; approvedVersion: number | null };
  campaign: { id: string; counts: CampaignCounts } | null;
  results: { visits: number; signups: number };
  mode: "socialflow" | "export";
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function computeJourney(input: JourneyInput): JourneyStep[] {
  const { profile, strategy, campaign, results, mode } = input;
  const c = campaign?.counts;
  const campaignHref = campaign ? `/app/campaigns/${campaign.id}` : "/app/campaigns";

  const productDone = profile.exists && !profile.needsApproval;
  const strategyDone = strategy.approvedVersion !== null;
  const contentDone = !!c && c.total > 0 && c.review === 0;
  const distributeDone = !!c && c.published > 0;
  const measureDone = results.visits + results.signups > 0;

  const raw: Omit<JourneyStep, "state">[] = [
    {
      id: "product",
      title: "Product",
      ...(productDone
        ? { line: profile.approvedVersion ? `Profile v${profile.approvedVersion} approved` : "Profile written in your words", waitingOnYou: false }
        : profile.exists
          ? { line: "Banyan drafted your profile from your website. Check it and approve it.", waitingOnYou: true, action: { label: "Review profile", href: "/app/product" } }
          : { line: "Paste your product URL. Banyan reads up to three public pages and drafts your profile.", waitingOnYou: true, action: { label: "Add your product", href: "/app/product" } }),
    },
    {
      id: "strategy",
      title: "Strategy",
      ...(strategyDone
        ? { line: `Strategy v${strategy.approvedVersion} approved`, waitingOnYou: false }
        : strategy.proposedVersion
          ? { line: `Banyan drafted strategy v${strategy.proposedVersion}: channels, cadence and KPIs. Review it.`, waitingOnYou: true, action: { label: "Review strategy", href: "/app/strategy" } }
          : { line: "Banyan drafts channels, formats, angles and KPIs from your approved profile.", waitingOnYou: true, action: { label: "Generate strategy", href: "/app/strategy" } }),
    },
    {
      id: "content",
      title: "Content",
      ...(contentDone
        ? { line: `${plural(c!.total, "post")} written and reviewed`, waitingOnYou: false }
        : c && c.review > 0
          ? { line: `Banyan wrote ${plural(c.total, "draft")}. ${c.review} ${c.review === 1 ? "waits" : "wait"} on your review.`, waitingOnYou: true, action: { label: "Review drafts", href: "/app/approvals" } }
          : { line: "Banyan writes one draft per channel and format in the approved strategy.", waitingOnYou: true, action: { label: "Write drafts", href: "/app/strategy" } }),
    },
    {
      id: "distribute",
      title: "Distribute",
      ...(distributeDone
        ? { line: `${plural(c!.published, "post")} live${c!.ready ? `, ${c!.ready} still to post` : ""}`, waitingOnYou: false }
        : c && c.failed > 0
          ? { line: `${plural(c.failed, "post")} did not go out. The reason is on each post.`, waitingOnYou: true, action: { label: "Open campaign", href: campaignHref } }
          : c && c.ready > 0
            ? {
                line: mode === "socialflow" ? `${plural(c.ready, "approved post")} ready. Banyan publishes them through SocialFlow.ai.` : `${plural(c.ready, "approved post")} ready. Post them from the kit and paste the live links back.`,
                waitingOnYou: true,
                action: { label: mode === "socialflow" ? "Publish" : "Open posting kit", href: campaignHref },
              }
            : { line: mode === "socialflow" ? "Approved posts go out through SocialFlow.ai." : "Approved posts go out from a posting kit, each with its own tracked link.", waitingOnYou: false }),
    },
    {
      id: "measure",
      title: "Measure",
      ...(measureDone
        ? { line: `${plural(results.visits, "tracked visit")} and ${plural(results.signups, "signup")} in 14 days`, waitingOnYou: false, action: { label: "See results", href: "/app/analytics" } }
        : { line: "Each post's tracked link records visits and signups. Banyan is watching for the first one.", waitingOnYou: false }),
    },
  ];

  const done = [productDone, strategyDone, contentDone, distributeDone, measureDone];
  const currentIndex = done.findIndex((d) => !d);
  return raw.map((step, i) => ({
    ...step,
    // A later step that is genuinely done (posts live while new drafts wait
    // on review) still shows as done: the path reflects records, not order.
    state: i === currentIndex ? "current" : done[i] ? "done" : "upcoming",
    // Only the current step asks anything of the founder.
    waitingOnYou: i === currentIndex ? step.waitingOnYou : false,
    action: i === currentIndex || (done[i] && step.id === "measure") ? step.action : undefined,
  }));
}
