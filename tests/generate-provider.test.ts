import { describe, it, expect } from "vitest";
import { generateContent, generateDraftPlan } from "@/lib/ai/generate";
import type { AIProvider } from "@/lib/ai/provider";

/**
 * Content and plan generation must use the provider they are handed, so the
 * routed provider (quota + usage ledger) actually sees every call.
 */
function spyProvider(text: string): AIProvider & { calls: number } {
  const p = {
    name: "spy",
    calls: 0,
    async complete() {
      p.calls += 1;
      return { text, usage: { provider: "spy", model: "spy-1", isFallback: false, label: "spy" } };
    },
  };
  return p;
}

const profile = { name: "Ledgerline", description: "Invoicing that works offline.", valueProp: "Send invoices from anywhere.", audience: "Freelancers" };

describe("generators use the provider they are given", () => {
  it("generateContent", async () => {
    const p = spyProvider("Your invoice should not wait for signal. Ledgerline sends it the moment you are back online.");
    const out = await generateContent({ channel: "linkedin", format: "insight", profile, brandVoice: {}, provider: p });
    expect(p.calls).toBe(1);
    expect(out.provider).toBe("spy");
    expect(out.isFallback).toBe(false);
  });

  it("generateDraftPlan", async () => {
    const plan = JSON.stringify({
      positioning: "Hypothesis: invoicing that never waits for signal",
      contentThemes: ["The cost of no signal", "Building offline-first", "Honest early results"],
      channelFocus: ["linkedin"],
      initialCampaign: { name: "First wave", keyMessage: "Get paid offline", cta: "Try it" },
      experiments: [{ title: "Angle test", hypothesis: "Offline beats speed", variable: "angle" }],
      assumptions: ["Freelancers invoice on the move"],
    });
    const p = spyProvider(plan);
    const out = await generateDraftPlan({
      productName: "Ledgerline", productDescription: "Invoicing", problem: "No signal", valueProp: "Anywhere", stage: "building",
      audience: "Freelancers", audiencePain: "", audienceOutcome: "", goal: "first_users", channels: ["linkedin"], provider: p,
    });
    expect(p.calls).toBe(1);
    expect(out.provider).toBe("spy");
  });
});

describe("plan length clamping", () => {
  it("shortens an over-long theme at a word boundary instead of discarding the plan", async () => {
    const { clampPlanLengths, PLAN_SCHEMA } = await import("@/lib/ai/generate");
    const longTheme = "Working from anywhere: " + "the invoice that waits for signal is the invoice that waits to be paid, ".repeat(3);
    const raw = {
      positioning: "Hypothesis: invoicing that never waits for signal",
      contentThemes: [longTheme, "Building offline-first", "Honest early results"],
      channelFocus: ["linkedin"],
      initialCampaign: { name: "First wave", keyMessage: "Get paid offline, every time", cta: "Try it" },
      experiments: [{ title: "Angle test", hypothesis: "Offline beats speed as an opening", variable: "angle" }],
    };
    expect(() => PLAN_SCHEMA.parse(raw)).toThrow();
    const plan = PLAN_SCHEMA.parse(clampPlanLengths(raw));
    expect(plan.contentThemes[0].length).toBeLessThanOrEqual(120);
    expect(plan.contentThemes[0].endsWith("…")).toBe(true);
    expect(plan.contentThemes[0]).not.toMatch(/\s…$/);
    expect(plan.contentThemes[1]).toBe("Building offline-first");
  });

  it("still rejects structural problems", async () => {
    const { clampPlanLengths, PLAN_SCHEMA } = await import("@/lib/ai/generate");
    expect(() => PLAN_SCHEMA.parse(clampPlanLengths({ positioning: "Hypothesis: something real", contentThemes: ["a theme here"], channelFocus: ["myspace"] }))).toThrow();
  });
});
