import { describe, it, expect } from "vitest";
import { computeJourney, type JourneyInput } from "@/lib/journey";
import { campaignCounts, nextCampaignStep } from "@/lib/campaign/progress";

const base: JourneyInput = {
  profile: { exists: false, approvedVersion: null, needsApproval: false, fromWebsite: false },
  strategy: { proposedVersion: null, approvedVersion: null },
  campaign: null,
  results: { visits: 0, signups: 0 },
  mode: "export",
};
const states = (i: JourneyInput) => computeJourney(i).map((s) => `${s.id}:${s.state}`);

describe("launch path", () => {
  it("starts at the product with one action", () => {
    const steps = computeJourney(base);
    expect(states(base)).toEqual(["product:current", "strategy:upcoming", "content:upcoming", "distribute:upcoming", "measure:upcoming"]);
    expect(steps[0]).toMatchObject({ waitingOnYou: true, action: { label: "Add your product", href: "/app/product" } });
    expect(steps.slice(1).every((s) => !s.action && !s.waitingOnYou)).toBe(true);
  });

  it("asks for approval of a website-drafted profile", () => {
    const steps = computeJourney({ ...base, profile: { exists: true, approvedVersion: null, needsApproval: true, fromWebsite: true } });
    expect(steps[0].line).toMatch(/from your website/);
    expect(steps[0].action?.label).toBe("Review profile");
  });

  it("moves to a proposed strategy waiting on the founder", () => {
    const i = { ...base, profile: { exists: true, approvedVersion: 2, needsApproval: false, fromWebsite: true }, strategy: { proposedVersion: 3, approvedVersion: null } };
    const steps = computeJourney(i);
    expect(steps[0]).toMatchObject({ state: "done", line: "Profile v2 approved" });
    expect(steps[1]).toMatchObject({ state: "current", waitingOnYou: true, action: { label: "Review strategy" } });
  });

  it("names drafts waiting on review, then the posting kit in export mode", () => {
    const ready = { ...base, profile: { exists: true, approvedVersion: 1, needsApproval: false, fromWebsite: false }, strategy: { proposedVersion: null, approvedVersion: 2 } };
    const reviewing = computeJourney({ ...ready, campaign: { id: "c1", counts: campaignCounts(["ready_for_review", "ready_for_review", "approved"]) } });
    expect(reviewing[2]).toMatchObject({ state: "current", line: "Banyan wrote 3 drafts. 2 wait on your review." });
    const posting = computeJourney({ ...ready, campaign: { id: "c1", counts: campaignCounts(["approved", "approved"]) } });
    expect(posting[2].state).toBe("done");
    expect(posting[3]).toMatchObject({ state: "current", action: { label: "Open posting kit", href: "/app/campaigns/c1" } });
  });

  it("waits for the first tracked visit, and closes the loop when one arrives", () => {
    const live = { ...base, profile: { exists: true, approvedVersion: 1, needsApproval: false, fromWebsite: false }, strategy: { proposedVersion: null, approvedVersion: 1 }, campaign: { id: "c1", counts: campaignCounts(["published"]) } };
    const waiting = computeJourney(live);
    expect(waiting[4]).toMatchObject({ state: "current", waitingOnYou: false });
    const closed = computeJourney({ ...live, results: { visits: 12, signups: 1 } });
    expect(closed.every((s) => s.state === "done")).toBe(true);
    expect(closed[4]).toMatchObject({ line: "12 tracked visits and 1 signup in 14 days", action: { label: "See results" } });
  });

  it("shows later progress as done even while an earlier step is current", () => {
    const i = { ...base, profile: { exists: true, approvedVersion: 1, needsApproval: false, fromWebsite: false }, strategy: { proposedVersion: null, approvedVersion: 1 }, campaign: { id: "c1", counts: campaignCounts(["published", "ready_for_review"]) } };
    expect(states(i)).toEqual(["product:done", "strategy:done", "content:current", "distribute:done", "measure:upcoming"]);
  });
});

describe("campaign progress", () => {
  it("counts posts by where they are", () => {
    expect(campaignCounts(["draft", "ready_for_review", "rejected", "approved", "scheduled", "publishing", "published", "failed", "archived"])).toEqual({
      total: 8, review: 3, ready: 1, scheduled: 1, publishing: 1, published: 1, failed: 1,
    });
  });

  it("names one next step, failures first", () => {
    expect(nextCampaignStep(campaignCounts([]), "export").kind).toBe("write");
    expect(nextCampaignStep(campaignCounts(["failed", "ready_for_review"]), "export").kind).toBe("fix");
    expect(nextCampaignStep(campaignCounts(["ready_for_review"]), "export")).toMatchObject({ kind: "review", label: "Review 1 draft" });
    expect(nextCampaignStep(campaignCounts(["approved", "approved"]), "export")).toMatchObject({ kind: "post", label: "Post 2 approved posts" });
    expect(nextCampaignStep(campaignCounts(["approved"]), "socialflow").kind).toBe("publish");
    expect(nextCampaignStep(campaignCounts(["published"]), "export").kind).toBe("measure");
  });
});
