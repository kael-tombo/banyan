import { describe, expect, it } from "vitest";
import {
  SOCIALFLOW_REQUIRED_CAPABILITIES,
  buildSocialFlowHandoff,
  parseVideoExtras,
  socialflowHandoffToText,
} from "@/lib/publishing/socialflow";
import { capabilityById } from "@/lib/capabilities/registry";

describe("SocialFlow.ai handoff (manual execution boundary)", () => {
  const base = {
    id: "item_123",
    title: "Why founders ship faster with a distribution plan",
    channel: "linkedin",
    format: "text",
    body: "Most founders don't fail at building. They fail at distributing.\n\nHere is the loop we run instead.",
  };

  it("carries the exact approved copy, channel and format", () => {
    const h = buildSocialFlowHandoff(base);
    expect(h.provider).toBe("socialflow");
    expect(h.mode).toBe("manual_handoff");
    expect(h.title).toBe(base.title);
    expect(h.body).toBe(base.body);
    expect(h.channel).toBe("linkedin");
    expect(h.format).toBe("text");
    expect(h.source).toBe("banyan:item_123");
  });

  it("includes the execution checklist ending with recording the live URL", () => {
    const h = buildSocialFlowHandoff(base);
    const last = h.checklist[h.checklist.length - 1];
    expect(last).toContain("record it in Banyan as a manual publication");
    expect(h.checklist.some((c) => c.includes("approved"))).toBe(true);
  });

  it("passes a scheduled time through as the suggested schedule", () => {
    const when = new Date("2026-11-02T09:30:00.000Z");
    const h = buildSocialFlowHandoff({ ...base, scheduledFor: when });
    expect(h.suggestedSchedule).toBe("2026-11-02T09:30:00.000Z");
    expect(h.checklist.some((c) => c.startsWith("4. Schedule"))).toBe(true);
  });

  it("renders plain text containing title, body and source for the clipboard", () => {
    const text = socialflowHandoffToText(buildSocialFlowHandoff(base));
    expect(text).toContain(base.title);
    expect(text).toContain("distributing");
    expect(text).toContain("Channel: linkedin");
    expect(text).toContain("banyan:item_123");
    expect(text).toContain("Checklist");
  });

  it("surfaces short-form video extras in the package and the text", () => {
    const extras = JSON.stringify({
      hook: "Stop posting into the void.",
      scenes: [{ scene: "1", visual: "dashboard close-up" }],
      caption: "Build. Distribute. Grow.",
      cta: "Link in bio.",
    });
    const h = buildSocialFlowHandoff({
      ...base,
      channel: "shortvideo",
      format: "script",
      videoExtras: extras,
    });
    expect(h.videoExtras).toBeDefined();
    expect((h.videoExtras as Record<string, unknown>).hook).toBe("Stop posting into the void.");
    const text = socialflowHandoffToText(h);
    expect(text).toContain("Short-form video script");
    expect(text).toContain("Stop posting into the void.");
    expect(text).toContain("Link in bio.");
  });

  it("parses videoExtras defensively (garbage in, undefined out)", () => {
    expect(parseVideoExtras(null)).toBeUndefined();
    expect(parseVideoExtras("")).toBeUndefined();
    expect(parseVideoExtras("not json at all")).toBeUndefined();
    expect(parseVideoExtras("{}")).toBeUndefined();
    expect(parseVideoExtras(JSON.stringify({ caption: "hi" }))).toEqual({ caption: "hi" });
  });

  it("never invents API capabilities — the required-capability contract is explicit", () => {
    expect(SOCIALFLOW_REQUIRED_CAPABILITIES.provider).toBe("socialflow");
    expect(SOCIALFLOW_REQUIRED_CAPABILITIES.channels).toEqual(["x", "linkedin", "shortvideo"]);
    expect(SOCIALFLOW_REQUIRED_CAPABILITIES.schedule).toBe(true);
    expect(SOCIALFLOW_REQUIRED_CAPABILITIES.metrics).toBe(true);
  });
});

describe("SocialFlow.ai capability registry honesty", () => {
  it("says a configured but not yet live-tested provider is still off", () => {
    const prev = process.env.SOCIALFLOW_API_URL;
    process.env.SOCIALFLOW_API_URL = "https://social.example.com";
    try {
      const d = capabilityById("socialflow")!.describe();
      expect(d.status).toBe("unavailable");
      expect(d.detail).toContain("has not yet passed the live test");
    } finally {
      if (prev === undefined) delete process.env.SOCIALFLOW_API_URL;
      else process.env.SOCIALFLOW_API_URL = prev;
    }
  });

  it("reports unavailable with the verification evidence, never 'available'", () => {
    const cap = capabilityById("socialflow");
    expect(cap).not.toBeNull();
    const d = cap!.describe();
    expect(d.status).toBe("unavailable");
    expect(d.detail).toContain("automated publishing is off");
    expect(d.detail).toContain("export mode");
    expect(d.detail).toContain("manual publication");
    // Since ADR-003 SocialFlow.ai owns the publishing capabilities; they stay
    // unavailable (asserted above) until the adapter is verified.
    expect(d.capabilities).toEqual(expect.arrayContaining(["publish.socialflow.handoff", "publish.x", "publish.linkedin"]));
  });
});
