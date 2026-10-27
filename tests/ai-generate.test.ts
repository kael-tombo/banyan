import { describe, it, expect } from "vitest";
import { PLAN_SCHEMA, videoExtrasSchema, generateContent } from "@/lib/ai/generate";
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
