/**
 * The one thing that matters next in a cycle, and whose move it is. The cycle
 * page leads with it, so a founder arriving from onboarding (or coming back a
 * day later) never has to read seven stages and six sections to find out.
 *
 * Pure and ordered: the first rule that matches wins. Rules that need the
 * founder come before rules where Banyan is working, so a waiting decision is
 * never hidden behind progress.
 */

export type CycleFacts = {
  goalStatus: string;
  planStatus: string | null;
  strategyStatus: string | null;
  drafts: number;
  pendingReview: number;
  gateWaiting: boolean;
  approved: number;
  published: number;
  publishBlocked: boolean;
  otherBlocked: number;
  hasOpenWork: boolean;
  manualPending: number;
  firstManualId: string | null;
  clicks: number;
  trackedLinks: number;
  hasRecommendation: boolean;
  /** A verified or configured LinkedIn/X connection exists; without one nothing goes out automatically. */
  hasLiveConnection?: boolean;
};

export type NextStep = {
  /** Whose move: the founder's, Banyan's, or nobody's (finished or stopped). */
  who: "you" | "banyan" | "done" | "blocked";
  title: string;
  body: string;
  action?: { label: string; href: string } | { label: string; gate: true };
};

export function nextStep(f: CycleFacts): NextStep {
  if (f.goalStatus === "cancelled") {
    return { who: "done", title: "This cycle was cancelled", body: "Completed work and every record stay. Start a new cycle whenever you're ready.", action: { label: "Start a new cycle", href: "/app/cycles/new" } };
  }
  if (f.otherBlocked > 0) {
    return { who: "blocked", title: "Something stopped this cycle", body: "A step failed and is waiting for a retry. Its state is kept; nothing is lost.", action: { label: "See what's blocked", href: "#blocking" } };
  }
  if (f.goalStatus === "awaiting_approval" || f.planStatus === "proposed") {
    return { who: "you", title: "Approve the plan", body: "Banyan drafted the plan from your product and objective. Nothing is written or published until you approve it.", action: { label: "Read the plan", href: "#plan" } };
  }
  if (f.strategyStatus === "proposed") {
    return { who: "you", title: "Review the strategy", body: "Channels, angles, cadence and what success looks like. Approve it and Banyan writes the three posts from it.", action: { label: "Review the strategy", href: "/app/strategy" } };
  }
  if (f.pendingReview > 0) {
    return {
      who: "you",
      title: f.pendingReview === 1 ? "Review the draft" : `Review ${f.pendingReview} drafts`,
      body: "Read each post, edit anything, then approve or reject it. Approval is recorded per post.",
      action: { label: f.pendingReview === 1 ? "Review it" : `Review ${f.pendingReview}`, href: "/app/approvals" },
    };
  }
  if (f.gateWaiting && f.pendingReview === 0) {
    return { who: "you", title: "Close the execution gate", body: "Every draft has a decision. Closing the gate lets Banyan publish what you approved; it cannot approve anything for you.", action: { label: "Close the gate", gate: true } };
  }
  if (f.publishBlocked) {
    return { who: "you", title: "Connect a channel to publish", body: "Your approved posts are ready, but no verified connection can publish them. Connect LinkedIn or X, or post natively and record the link.", action: { label: "Open Publishing", href: "/app/publishing" } };
  }
  if (f.hasOpenWork && f.drafts < 3) {
    return {
      who: "banyan",
      title: f.drafts === 0 ? "Banyan is writing your strategy and posts" : `Banyan is writing: ${f.drafts} of 3 posts drafted`,
      body: "This usually takes a few minutes. You can leave this page; everything waits for your review when it's ready.",
    };
  }
  if (f.approved > 0 && f.published === 0 && f.hasLiveConnection === false) {
    return {
      who: "you",
      title: f.approved === 1 ? "Post your approved post" : `Post your ${f.approved} approved posts`,
      body: "No publishing connection is set up, so Banyan can't post for you. Open each post, publish it on the platform, and paste the live link back; or connect LinkedIn or X and Banyan does it.",
      action: { label: "Open Publishing", href: "/app/publishing" },
    };
  }
  if (f.approved > 0 && f.published === 0 && f.hasOpenWork) {
    return { who: "banyan", title: "Publishing what you approved", body: "Banyan is sending your approved posts to their channels and waits for each one to be confirmed live." };
  }
  if (f.manualPending > 0 && f.firstManualId) {
    return { who: "you", title: "Record the short video", body: "Banyan wrote the script; recording and posting are yours. Then attach the live link so the cycle can count it.", action: { label: "Open the script", href: `/app/content/${f.firstManualId}` } };
  }
  if (f.hasRecommendation) {
    return { who: "you", title: "Start the next cycle", body: "This cycle produced measured results and a proposal for what to do next, built on them.", action: { label: "Start the next cycle", href: "/app/cycles/new" } };
  }
  if (f.published > 0) {
    return {
      who: "banyan",
      title: "Measuring results",
      body:
        f.trackedLinks > 0
          ? `${f.clicks} tracked click${f.clicks === 1 ? "" : "s"} so far. Banyan proposes the next move once there is enough to learn from.`
          : "Your posts are live. Banyan proposes the next move once there is measured evidence.",
    };
  }
  return { who: "banyan", title: "Banyan is preparing the plan", body: "It starts from the product profile and the objective you set. You'll approve it before anything is written." };
}
