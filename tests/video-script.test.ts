import { describe, it, expect } from "vitest";
import {
  buildVideoTimeline,
  estimatedRuntime,
  normalizeAdaptations,
  adaptationLimit,
  claimLint,
  reviewChecklist,
  ADAPTATION_TARGETS,
} from "@/lib/video-script";

describe("buildVideoTimeline", () => {
  it("lays out hook, scenes, and CTA with estimated pacing", () => {
    const segs = buildVideoTimeline({
      hook: "Still answering the same questions every day?",
      scenes: [{ scene: "Screen capture: repetitive ticket", visual: "screen" }, { scene: "AI drafts the reply", visual: "app" }],
      cta: "See how it helps your team.",
    });
    expect(segs).toHaveLength(4);
    expect(segs![0]).toMatchObject({ label: "Hook", startSec: 0, endSec: 3 });
    expect(segs![1]).toMatchObject({ label: "Scene 1", startSec: 3, endSec: 9 });
    expect(segs![2]).toMatchObject({ label: "Scene 2", startSec: 9, endSec: 15 });
    expect(segs![3]).toMatchObject({ label: "CTA", startSec: 15, endSec: 18 });
    expect(estimatedRuntime(segs)).toBe(18);
    expect(segs!.every((s) => s.estimated)).toBe(true);
  });

  it("returns null when there is no script structure", () => {
    expect(buildVideoTimeline(null)).toBeNull();
    expect(buildVideoTimeline({})).toBeNull();
    expect(buildVideoTimeline({ caption: "only a caption" })).toBeNull();
  });

  it("keeps segments whose visual note is the only content", () => {
    const segs = buildVideoTimeline({ scenes: [{ visual: "close-up of the dashboard" }] });
    expect(segs).toHaveLength(1);
    expect(segs![0].text).toBe("close-up of the dashboard");
  });
});

describe("normalizeAdaptations / adaptationLimit", () => {
  it("keeps only the three real channels and defaults to empty strings", () => {
    const out = normalizeAdaptations({ x: "post", tiktok: "ghost", linkedin: "  " });
    expect(out).toEqual({ x: "post", linkedin: "", shortvideo: "" });
    expect(normalizeAdaptations(undefined)).toEqual({ x: "", linkedin: "", shortvideo: "" });
  });

  it("exposes per-channel limits", () => {
    expect(ADAPTATION_TARGETS.map((t) => t.limit)).toEqual([280, 3000, 6000]);
    expect(adaptationLimit("linkedin")).toBe(3000);
    expect(adaptationLimit("unknown")).toBe(6000);
  });
});

describe("claimLint", () => {
  it("flags absolute and unverifiable phrasing", () => {
    const flags = claimLint("We guarantee 100% results. Everyone loves it — the world's best tool, instantly.");
    const whys = flags.map((f) => f.why);
    expect(whys).toContain("absolute guarantee");
    expect(whys).toContain("absolute percentage");
    expect(whys).toContain("universal claim");
    expect(whys).toContain("unverifiable superlative");
    expect(whys).toContain("speed claim");
  });

  it("returns empty for measured copy", () => {
    expect(claimLint("In our pilot with 3 stores, median first-response time dropped 28% (n=3).")).toEqual([]);
  });

  it("caps the number of flags", () => {
    const flags = claimLint("guaranteed 100% risk-free #1 instantly overnight everyone never fails 10x");
    expect(flags.length).toBeLessThanOrEqual(5);
  });
});

describe("reviewChecklist", () => {
  it("requires human review when evidence is missing and claims are flagged", () => {
    const { checks, humanReviewRequired } = reviewChecklist({
      status: "draft",
      genMeta: { provider: "openai", model: "gpt-x" },
      sourceRef: null,
      campaignEvidence: null,
      claims: [{ phrase: "guaranteed", why: "absolute guarantee" }],
    });
    expect(humanReviewRequired).toBe(true);
    expect(checks.find((c) => c.key === "provenance")?.state).toBe("ready");
    expect(checks.find((c) => c.key === "evidence")?.state).toBe("needs_review");
    expect(checks.find((c) => c.key === "claims")?.state).toBe("needs_review");
    expect(checks.find((c) => c.key === "gate")?.state).toBe("verify");
  });

  it("reads ready when approved with evidence and clean copy", () => {
    const { checks, humanReviewRequired } = reviewChecklist({
      status: "approved",
      genMeta: { provider: "openai" },
      sourceRef: "https://example.com/pilot",
      campaignEvidence: "28% lower median response (pilot, n=3)",
      claims: [],
    });
    expect(humanReviewRequired).toBe(false);
    expect(checks.every((c) => c.state === "ready")).toBe(true);
  });

  it("marks fallback generation as verify, not ready", () => {
    const { checks } = reviewChecklist({
      status: "draft",
      genMeta: { provider: "fallback", isFallback: true },
      sourceRef: "s",
      campaignEvidence: null,
      claims: [],
    });
    expect(checks.find((c) => c.key === "provenance")?.state).toBe("verify");
  });
});
