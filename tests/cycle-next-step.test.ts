import { describe, it, expect } from "vitest";
import { nextStep, type CycleFacts } from "@/lib/cycle/next-step";

const base: CycleFacts = {
  goalStatus: "active",
  planStatus: null,
  strategyStatus: null,
  drafts: 0,
  pendingReview: 0,
  gateWaiting: false,
  approved: 0,
  published: 0,
  publishBlocked: false,
  otherBlocked: 0,
  hasOpenWork: false,
  manualPending: 0,
  firstManualId: null,
  clicks: 0,
  trackedLinks: 0,
  hasRecommendation: false,
};
const step = (f: Partial<CycleFacts>) => nextStep({ ...base, ...f });

describe("the cycle's next step", () => {
  it("walks a fresh cycle from Banyan's work to each decision the founder owns", () => {
    expect(step({ hasOpenWork: true })).toMatchObject({ who: "banyan", title: "Banyan is writing your strategy and posts" });
    expect(step({ strategyStatus: "proposed", hasOpenWork: true })).toMatchObject({ who: "you", title: "Review the strategy", action: { href: "/app/strategy" } });
    expect(step({ drafts: 3, pendingReview: 3 })).toMatchObject({ who: "you", title: "Review 3 drafts", action: { href: "/app/approvals" } });
    expect(step({ drafts: 3, gateWaiting: true })).toMatchObject({ who: "you", action: { gate: true } });
    expect(step({ drafts: 3, approved: 2, hasOpenWork: true })).toMatchObject({ who: "banyan", title: "Publishing what you approved" });
    expect(step({ drafts: 3, approved: 2, published: 2, trackedLinks: 2, clicks: 1 })).toMatchObject({ who: "banyan", title: "Measuring results", body: expect.stringContaining("1 tracked click so far") });
    expect(step({ published: 2, hasRecommendation: true })).toMatchObject({ who: "you", title: "Start the next cycle" });
  });

  it("puts a waiting decision ahead of progress", () => {
    // Banyan still has open work, but a draft needs the founder: the founder's move wins.
    expect(step({ hasOpenWork: true, drafts: 1, pendingReview: 1 }).title).toBe("Review the draft");
    expect(step({ goalStatus: "awaiting_approval", hasOpenWork: true }).title).toBe("Approve the plan");
  });

  it("surfaces blocks before anything else, except a cancelled cycle", () => {
    expect(step({ otherBlocked: 1, pendingReview: 2 })).toMatchObject({ who: "blocked", action: { href: "#blocking" } });
    expect(step({ goalStatus: "cancelled", otherBlocked: 1 }).who).toBe("done");
    expect(step({ approved: 3, publishBlocked: true }).title).toBe("Connect a channel to publish");
  });

  it("asks for the manual video only once the rest is published", () => {
    expect(step({ approved: 3, published: 2, manualPending: 1, firstManualId: "c9" })).toMatchObject({ who: "you", action: { href: "/app/content/c9" } });
  });
});

describe("drafts before the gate", () => {
  it("asks for reviews while drafts wait, even with the gate open", () => {
    expect(step({ drafts: 3, pendingReview: 3, gateWaiting: true })).toMatchObject({ title: "Review 3 drafts", action: { href: "/app/approvals" } });
    expect(step({ drafts: 3, pendingReview: 0, gateWaiting: true }).title).toBe("Close the execution gate");
  });
});
