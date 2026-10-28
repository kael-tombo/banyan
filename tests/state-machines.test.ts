import { describe, it, expect } from "vitest";
import { canTransitionCampaign, canTransitionContent, isExportableContent } from "@/lib/state-machines";

describe("campaign state machine", () => {
  it("allows the documented forward transitions", () => {
    expect(canTransitionCampaign("draft", "planned")).toBe(true);
    expect(canTransitionCampaign("planned", "in_progress")).toBe(true);
    expect(canTransitionCampaign("in_progress", "completed")).toBe(true);
  });

  it("rejects transitions it does not define", () => {
    expect(canTransitionCampaign("draft", "completed")).toBe(false);
    expect(canTransitionCampaign("archived", "completed")).toBe(false);
  });

  it("treats a no-op save as allowed", () => {
    expect(canTransitionCampaign("draft", "draft")).toBe(true);
  });

  it("rejects unknown statuses", () => {
    expect(canTransitionCampaign("nonsense", "draft")).toBe(false);
  });
});

describe("content state machine", () => {
  it("will not let archived content move again", () => {
    expect(canTransitionContent("archived", "draft")).toBe(false);
    expect(canTransitionContent("archived", "approved")).toBe(false);
  });

  it("forces review before approval", () => {
    expect(canTransitionContent("draft", "approved")).toBe(false);
    expect(canTransitionContent("ready_for_review", "approved")).toBe(true);
  });

  it("only reaches published from publishing", () => {
    expect(canTransitionContent("approved", "published")).toBe(false);
    expect(canTransitionContent("publishing", "published")).toBe(true);
  });

  it("lets failed content be retried or reset", () => {
    expect(canTransitionContent("failed", "scheduled")).toBe(true);
    expect(canTransitionContent("failed", "draft")).toBe(true);
  });
});

describe("export guard", () => {
  it("requires an approved status AND a recorded approver", () => {
    expect(isExportableContent({ status: "draft", approvedById: "u1" })).toBe(false);
    expect(isExportableContent({ status: "approved", approvedById: null })).toBe(false);
    expect(isExportableContent({ status: "approved", approvedById: "u1" })).toBe(true);
    expect(isExportableContent({ status: "scheduled", approvedById: "u1" })).toBe(true);
  });
});

// Regression: the publisher moves approved content through a transient
// "publishing" state; the export guard must not mistake that handoff for a
// revoked approval. The approval itself (approvedById) remains mandatory.
describe("isExportableContent — publisher handoff", () => {
  it("treats 'publishing' with recorded approval as exportable", () => {
    expect(isExportableContent({ status: "publishing", approvedById: "u1" })).toBe(true);
  });
  it("still refuses any export when the approval was revoked", () => {
    expect(isExportableContent({ status: "publishing", approvedById: null })).toBe(false);
    expect(isExportableContent({ status: "draft", approvedById: "u1" })).toBe(false);
    expect(isExportableContent({ status: "rejected", approvedById: "u1" })).toBe(false);
  });
});
