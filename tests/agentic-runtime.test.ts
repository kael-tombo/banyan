import { describe, expect, it } from "vitest";
import { evaluateQuota, estimateCostMicros, startOfUtcDay } from "@/lib/model/quota";
import { TemplateFallbackProvider } from "@/lib/ai/provider";
import { recommendationConfidence } from "@/lib/agents/handlers/analysis";
import { allCapabilities, capabilityFor } from "@/lib/capabilities/registry";
import { fastlaneAdapter, fastlaneConfigFromEnv } from "@/lib/capabilities/fastlane";

describe("model quota policy", () => {
  it("allows calls under the daily cap and reports remaining budget", () => {
    const d = evaluateQuota({ liveCallsToday: 3, limitPerDay: 5 });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(2);
  });

  it("blocks calls at the cap with an honest, actionable reason", () => {
    const d = evaluateQuota({ liveCallsToday: 5, limitPerDay: 5 });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/quota reached/);
    expect(d.reason).toMatch(/template fallback/);
  });

  it("treats a zero limit as always-blocked", () => {
    expect(evaluateQuota({ liveCallsToday: 0, limitPerDay: 0 }).allowed).toBe(false);
  });

  it("resets at UTC midnight boundaries", () => {
    const d = new Date("2026-10-28T07:45:12Z");
    expect(startOfUtcDay(d).toISOString()).toBe("2026-10-28T00:00:00.000Z");
  });
});

describe("cost estimation", () => {
  it("uses the known price table for known models", () => {
    // gpt-4o-mini: $0.15/1k input, $0.60/1k output → 1000 in + 500 out = 150 + 300 = 450µ$
    expect(estimateCostMicros("gpt-4o-mini", 1000, 500)).toBe(450);
  });

  it("records zero cost for unknown models instead of guessing", () => {
    expect(estimateCostMicros("totally-unknown-model", 100000, 100000)).toBe(0);
  });
});

describe("labeled template fallback", () => {
  it("always marks its output as a fallback — never as live model output", async () => {
    const p = new TemplateFallbackProvider();
    const res = await p.complete({ system: "s", user: "draft a post", maxTokens: 200 });
    expect(res.usage.isFallback).toBe(true);
    expect(res.usage.label.toLowerCase()).toContain("template");
    expect(res.usage.label.toLowerCase()).toMatch(/no model credentials/);
  });
});

describe("recommendation confidence policy", () => {
  it("requires material first-party evidence for high confidence", () => {
    const r = recommendationConfidence({ signups: 12, clicks: 40, publications: 2, evidenceCount: 3 });
    expect(r.confidence).toBe("high");
    expect(r.uncertainty.toLowerCase()).toMatch(/attribution/);
  });

  it("uses medium confidence for moderate samples", () => {
    expect(recommendationConfidence({ signups: 1, clicks: 45, publications: 1, evidenceCount: 2 }).confidence).toBe("medium");
  });

  it("stays low and discloses missing evidence when nothing was measured", () => {
    const r = recommendationConfidence({ signups: 0, clicks: 0, publications: 0, evidenceCount: 0 });
    expect(r.confidence).toBe("low");
    expect(r.uncertainty).toMatch(/no measured outcomes/i);
  });

  it("never grants high confidence from thin evidence alone", () => {
    expect(recommendationConfidence({ signups: 0, clicks: 5, publications: 1, evidenceCount: 2 }).confidence).not.toBe("high");
  });
});

describe("capability registry honesty", () => {
  it("describes every adapter with a status and honest detail", () => {
    const all = allCapabilities();
    expect(all.length).toBeGreaterThanOrEqual(4);
    for (const c of all) {
      expect(["available", "needs_credentials", "unverified", "unavailable"]).toContain(c.status);
      expect(c.detail.length).toBeGreaterThan(20);
    }
  });

  it("reports Fastlane as implemented-but-unverified (documented API, no live exercise)", () => {
    const d = fastlaneAdapter.describe();
    expect(d.untested).toBe(true);
    expect(d.docsUrl).toContain("developers.usefastlane.ai");
    // With no credentials configured in this environment it must ask for them.
    if (!fastlaneConfigFromEnv()) {
      expect(d.status).toBe("needs_credentials");
      expect(d.detail).toMatch(/FASTLANE_API_KEY/);
    }
  });

  it("claims creative + publishing + analytics for Fastlane but NOT brand analysis", () => {
    const caps = fastlaneAdapter.capabilities();
    expect(caps).toContain("creative.shortvideo");
    expect(caps).toContain("metrics.posts");
    expect(caps.some((c) => c.includes("brand"))).toBe(false);
  });

  it("reports the research capability as unavailable with an honest reason", () => {
    const research = capabilityFor("research.web_search");
    expect(research).not.toBeNull();
    const d = research!.describe();
    expect(d.status).toBe("unavailable");
    expect(d.detail).toMatch(/no external research provider is verified/i);
  });

  it("resolves the publishing capability to SocialFlow.ai, honestly unavailable until verified (ADR-003)", () => {
    const publishing = capabilityFor("publish.x");
    expect(publishing?.id).toBe("socialflow");
    const d = publishing!.describe();
    expect(d.status).toBe("unavailable");
    expect(d.detail).toMatch(/automated publishing (is|stays) off/i);
  });

  it("health() without credentials honestly reports the blocker", async () => {
    if (!fastlaneConfigFromEnv()) {
      const h = await fastlaneAdapter.health("ws");
      expect(h.ok).toBe(false);
      expect(h.detail).toMatch(/FASTLANE_API_KEY/);
    }
  });
});
