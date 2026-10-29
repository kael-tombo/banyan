import { describe, expect, it } from "vitest";
import {
  computeCampaignPipeline,
  hasUtmTags,
  computeLaunchChecklist,
  computeCampaignAttention,
} from "../src/lib/campaign-pipeline";

const baseInput = {
  status: "in_progress",
  contentTotal: 0,
  contentApproved: 0,
  contentScheduled: 0,
  contentPublished: 0,
  metricsRecorded: 0,
  completedAt: null,
};

describe("computeCampaignPipeline", () => {
  it("a brand-new campaign starts active at create", () => {
    const { stages, current, done } = computeCampaignPipeline(baseInput);
    expect(current).toBe("create");
    expect(done).toBe(false);
    expect(stages.find((s) => s.key === "prepare")?.state).toBe("complete");
    expect(stages.find((s) => s.key === "create")?.state).toBe("active");
    expect(stages.find((s) => s.key === "review")?.state).toBe("upcoming");
  });

  it("review completes only when at least one item is approved", () => {
    const { stages } = computeCampaignPipeline({ ...baseInput, contentTotal: 3, contentApproved: 0 });
    expect(stages.find((s) => s.key === "create")?.state).toBe("complete");
    expect(stages.find((s) => s.key === "review")?.state).toBe("active");
    expect(stages.find((s) => s.key === "review")?.detail).toContain("0 of 3");
  });

  it("scheduled content does not complete the publish stage — only a real publish does", () => {
    const { stages } = computeCampaignPipeline({
      ...baseInput,
      contentTotal: 2,
      contentApproved: 2,
      contentScheduled: 2,
      contentPublished: 0,
    });
    expect(stages.find((s) => s.key === "review")?.state).toBe("complete");
    expect(stages.find((s) => s.key === "publish")?.state).toBe("active");
    expect(stages.find((s) => s.key === "publish")?.detail).toContain("2 scheduled");
  });

  it("publish completes with a published item; learn needs metrics or completion", () => {
    const { stages, done } = computeCampaignPipeline({
      ...baseInput,
      contentTotal: 1,
      contentApproved: 1,
      contentScheduled: 1,
      contentPublished: 1,
    });
    expect(stages.find((s) => s.key === "publish")?.state).toBe("complete");
    expect(stages.find((s) => s.key === "learn")?.state).toBe("active");
    expect(done).toBe(false);
  });

  it("a fully closed loop reports done", () => {
    const { stages, current, done } = computeCampaignPipeline({
      ...baseInput,
      contentTotal: 1,
      contentApproved: 1,
      contentScheduled: 1,
      contentPublished: 1,
      metricsRecorded: 4,
    });
    expect(current).toBeNull();
    expect(done).toBe(true);
    expect(stages.every((s) => s.state === "complete")).toBe(true);
  });

  it("learn completes when the campaign itself is completed", () => {
    const completedAt = new Date("2026-01-01T00:00:00Z");
    const { stages, done } = computeCampaignPipeline({ ...baseInput, completedAt });
    // No metrics recorded, but the campaign is closed — learn completes even
    // though earlier stages were never filled. `done` stays false (earlier
    // stages are still open); only the learn state flips.
    expect(stages.find((s) => s.key === "learn")?.state).toBe("complete");
    expect(done).toBe(false);
    const closed = computeCampaignPipeline({
      ...baseInput,
      contentTotal: 1,
      contentApproved: 1,
      contentScheduled: 0,
      contentPublished: 0,
      completedAt,
    });
    expect(closed.stages.find((s) => s.key === "learn")?.detail).toContain("completed");
  });
});

describe("hasUtmTags", () => {
  it("detects keys in the recorded utm JSON", () => {
    expect(hasUtmTags(JSON.stringify({ utm_source: "x" }), "https://example.com")).toBe(true);
  });

  it("detects utm_ parameters on the target URL", () => {
    expect(hasUtmTags("{}", "https://example.com/?utm_campaign=launch")).toBe(true);
  });

  it("is false with no tags anywhere", () => {
    expect(hasUtmTags("{}", "https://example.com")).toBe(false);
    expect(hasUtmTags("not json at all", "https://example.com")).toBe(false);
  });
});

describe("computeLaunchChecklist", () => {
  it("is not ready when any of the four items is missing", () => {
    const partial = computeLaunchChecklist({
      trackedLinkCount: 1,
      utmTaggedLinkCount: 1,
      approvedItems: 0,
      liveConnections: 1,
    });
    expect(partial.ready).toBe(false);
    expect(partial.items.find((i) => i.key === "content-approved")?.done).toBe(false);
  });

  it("is ready only when links, UTM tags, approval and a connection all exist", () => {
    const full = computeLaunchChecklist({
      trackedLinkCount: 2,
      utmTaggedLinkCount: 1,
      approvedItems: 1,
      liveConnections: 1,
    });
    expect(full.ready).toBe(true);
    expect(full.items.every((i) => i.done)).toBe(true);
  });
});

describe("computeCampaignAttention", () => {
  it("surfaces blocked tasks first, then reviews, then gates", () => {
    const items = computeCampaignAttention({
      itemsInReview: 2,
      tasksWaitingApproval: 1,
      tasksBlocked: 1,
      scheduledCount: 0,
      publishedCount: 0,
      checklistReady: false,
    });
    expect(items.map((i) => i.key)).toEqual(["blocked", "review", "gate"]);
    expect(items[0].tone).toBe("clay");
  });

  it("flags a checklist gap when assets are scheduled but attribution is incomplete", () => {
    const items = computeCampaignAttention({
      itemsInReview: 0,
      tasksWaitingApproval: 0,
      tasksBlocked: 0,
      scheduledCount: 2,
      publishedCount: 0,
      checklistReady: false,
    });
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("checklist");
    expect(items[0].tone).toBe("clay");
  });

  it("reports all-clear when nothing is wrong — and says so honestly", () => {
    const items = computeCampaignAttention({
      itemsInReview: 0,
      tasksWaitingApproval: 0,
      tasksBlocked: 0,
      scheduledCount: 0,
      publishedCount: 0,
      checklistReady: true,
    });
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("clear");
    expect(items[0].tone).toBe("forest");
    expect(items[0].label).toBe("Nothing needs your attention");
  });
});
