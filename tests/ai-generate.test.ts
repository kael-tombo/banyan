import { describe, it, expect } from "vitest";
import { PLAN_SCHEMA, videoExtrasSchema, generateContent, normalizeVideoExtras, buildContextPost } from "@/lib/ai/generate";
import { AIError } from "@/lib/ai/provider";

const validPlan = {
  positioning: "A clear positioning statement for testing the schema.",
  contentThemes: ["theme one is here", "theme two is here", "theme three here"],
  channelFocus: ["x"],
  initialCampaign: { name: "First wave", keyMessage: "A key message for the campaign", cta: "Try it today" },
  experiments: [
    { title: "Test A", hypothesis: "Problem-first openings earn more clicks", variable: "opening angle" },
  ],
  assumptions: [],
};

describe("PLAN_SCHEMA", () => {
  it("accepts a well-formed plan", () => {
    const parsed = PLAN_SCHEMA.parse(validPlan);
    expect(parsed.channelFocus).toEqual(["x"]);
  });

  it("requires exactly three content themes", () => {
    expect(PLAN_SCHEMA.safeParse({ ...validPlan, contentThemes: ["only one theme"] }).success).toBe(false);
  });

  it("rejects an unsupported channel", () => {
    expect(PLAN_SCHEMA.safeParse({ ...validPlan, channelFocus: ["tiktok"] }).success).toBe(false);
  });
});

describe("videoExtrasSchema", () => {
  it("requires a hook, a script and at least one scene", () => {
    const ok = videoExtrasSchema.safeParse({
      hook: "Stop guessing",
      script: "a".repeat(30),
      scenes: [{ scene: "Open on the founder", visual: "close-up" }],
    });
    expect(ok.success).toBe(true);
    expect(videoExtrasSchema.safeParse({ hook: "x", script: "short", scenes: [] }).success).toBe(false);
  });
});

describe("normalizeVideoExtras", () => {
  const ctx = {
    profile: {
      name: "Acme",
      description: "Acme helps solo founders turn one product update into three channel-native assets.",
      valueProp: "One update, three assets, no invented results.",
      audience: "solo B2B founders",
    },
    brandVoice: { cta: "Try Acme" },
  };

  it("uses valid JSON directly", () => {
    const raw = JSON.stringify({
      hook: "Stop writing the same update three times.",
      script: "Stop writing the same update three times. Acme drafts one asset per channel, and you approve every one before it publishes.",
      scenes: [{ scene: "Founder to camera", visual: "close-up" }],
      onScreenText: "One update, three assets",
      caption: "A calmer distribution cycle.",
      cta: "Try Acme",
    });
    const result = normalizeVideoExtras(raw, ctx, { fallback: false });
    expect(result.mode).toBe("json");
    expect(result.extras.hook).toContain("Stop writing");
  });

  it("structures model prose instead of throwing", () => {
    const prose = "Stop writing the same update three times. Acme turns one product update into three channel-native assets. You approve every asset before it publishes.";
    const result = normalizeVideoExtras(prose, ctx, { fallback: false });
    expect(result.mode).toBe("prose");
    expect(result.extras.script).toBe(prose);
    expect(result.extras.hook).toBe("Stop writing the same update three times.");
    expect(result.extras.scenes.length).toBeGreaterThan(0);
    expect(result.extras.scenes.every((s) => s.scene.length > 0 && s.visual.length > 0)).toBe(true);
  });

  it("salvages a script from malformed JSON with a script field", () => {
    const raw = JSON.stringify({ script: "We shipped saved research briefs so founders can reuse validated context instead of starting over." });
    const result = normalizeVideoExtras(raw, ctx, { fallback: false });
    expect(result.mode).toBe("prose");
    expect(result.extras.script).toContain("saved research briefs");
    expect(result.extras.scenes.length).toBeGreaterThan(0);
  });

  it("builds a grounded skeleton when the fallback provider returns prose", () => {
    const template = "TEMPLATE DRAFT — generated locally without a live model.\n\n1. State the problem.";
    const result = normalizeVideoExtras(template, ctx, { fallback: true });
    expect(result.mode).toBe("template");
    expect(result.extras.script).toContain("Acme");
    expect(result.extras.script).toContain("solo B2B founders");
    expect(result.extras.hook.length).toBeGreaterThanOrEqual(3);
    expect(result.extras.scenes.length).toBeGreaterThan(0);
    expect(result.extras.script.length).toBeGreaterThanOrEqual(20);
  });
});

describe("buildContextPost", () => {
  const base = {
    channel: "x" as const,
    format: "single",
    profile: {
      name: "Acme",
      description: "Acme helps solo founders turn one product update into three channel-native assets.",
      valueProp: "One update, three assets, no invented results.",
      audience: "solo B2B founders",
    },
    brandVoice: { cta: "Try Acme" },
  };

  it("builds a complete X single post inside the 280-character limit", () => {
    const body = buildContextPost(base);
    expect(body.length).toBeLessThanOrEqual(280);
    expect(body).toContain("solo B2B founders");
    expect(body).toContain("Try Acme");
    expect(body).not.toContain("TEMPLATE DRAFT");
  });

  it("builds a LinkedIn insight and carries only recorded campaign evidence", () => {
    const body = buildContextPost({
      ...base,
      channel: "linkedin",
      format: "insight",
      campaign: {
        name: "First wave",
        objective: "Get 5 signups",
        targetAudience: "solo B2B founders",
        keyMessage: "One update should not become three hours of copywriting.",
        evidence: "Pilot: median first-response time dropped 28% (n=3).",
        cta: "Try Acme",
      },
    });
    expect(body.length).toBeLessThanOrEqual(3000);
    expect(body).toContain("Pilot: median first-response time dropped 28%");
    expect(body).toContain("Try Acme");
    expect(body).not.toMatch(/100%|guarantee/i);
  });

  it("builds a numbered X thread with distinct posts", () => {
    const body = buildContextPost({ ...base, format: "thread" });
    expect(body.startsWith("1/ ")).toBe(true);
    expect(body).toContain("2/ ");
    expect(body).toContain("Try Acme");
  });
});

describe("generateContent pre-flight validation", () => {
  it("refuses a format that does not belong to the channel before any model call", async () => {
    await expect(
      generateContent({
        channel: "x",
        format: "insight", // LinkedIn-only format
        profile: { name: "Banyan", description: "Distribution OS", valueProp: "Plans and measures", audience: "Founders" },
        brandVoice: {},
      })
    ).rejects.toBeInstanceOf(AIError);
  });
});

describe("the no-model fallback reads like a post (signed-in run, 2026-11-08)", () => {
  // What cal.com's profile and the template planner's campaign looked like in the run.
  const calcom = {
    profile: {
      name: "Cal.com",
      description: "The highest-rated scheduling system that helps you grow your business and better find time.",
      valueProp: "The highest-rated scheduling system that helps you grow your business and better find time.",
      audience: "small businesses; small teams & startups with combined scheduling needs; larger teams looking for more control",
      problem: "Finding a meeting time takes a week of back-and-forth emails.",
      proof: ["Trusted by teams that meet at scale."],
    },
    campaign: {
      name: "Get 20 qualified signups in 14 days — wave 1",
      objective: "Get 20 qualified signups",
      targetAudience: "small businesses",
      keyMessage: "Hypothesis: small businesses need a direct, problem-first articulation of the core problem.",
      evidence: "Hypotheses under test (labelled, unvalidated): Hypothesis theme: the real cost of the core problem",
      cta: "Get started",
    },
    brandVoice: { cta: "Get started" },
  };

  it("LinkedIn: the pain, what was built, real proof, the ask; no hypotheses, no audience list", () => {
    const body = buildContextPost({ ...calcom, channel: "linkedin", format: "insight" });
    expect(body).toBe(
      [
        "Finding a meeting time takes a week of back-and-forth emails.",
        "That's why we built Cal.com: the highest-rated scheduling system that helps you grow your business and better find time.",
        "Trusted by teams that meet at scale.",
        "Get started.",
      ].join("\n\n"),
    );
    expect(body).not.toMatch(/hypothes|unvalidated|stand behind|;/i);
  });

  it("X single fits 280 characters and ends with the ask", () => {
    const body = buildContextPost({ ...calcom, channel: "x", format: "single" });
    expect(body.length).toBeLessThanOrEqual(280);
    expect(body.startsWith("Finding a meeting time")).toBe(true);
    expect(body.endsWith("Get started.")).toBe(true);
  });

  it("the video hook names the problem; the script never pastes the audience list", () => {
    const { extras } = normalizeVideoExtras("TEMPLATE DRAFT", { profile: calcom.profile, brandVoice: calcom.brandVoice, campaign: { cta: "Get started" } }, { fallback: true });
    expect(extras.hook).toBe("Finding a meeting time takes a week of back-and-forth emails.");
    expect(extras.script).toContain("That's why we built Cal.com");
    expect(extras.script).not.toContain(";");
  });
});
