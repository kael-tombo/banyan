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
