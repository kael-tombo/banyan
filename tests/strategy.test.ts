import { describe, it, expect } from "vitest";
import { generateStrategy, templateStrategy, finalizeStrategy, allowedChannels, StrategyInputError, type StrategyInput, type StrategyCompleter } from "@/lib/strategy/generate";
import { profileFacts, preferredChannels, objectiveFromProfile } from "@/lib/strategy/facts";
import { getPrompt, promptKey, renderPrompt } from "@/lib/ai/prompts";
import { strategyV1 } from "@/lib/ai/prompts/strategy.v1";

const profile = {
  name: "Ledgerline",
  description: "Invoicing that works offline.",
  valueProp: "Send invoices from anywhere.",
  problem: "Freelancers lose days of cash flow when they cannot invoice without signal.",
  audience: "Freelance designers and developers",
  audiencePain: "",
  features: JSON.stringify(["Offline invoicing", "Automatic reminders"]),
  differentiators: JSON.stringify([]),
};

const facts = profileFacts(profile);
const capabilities: StrategyInput["capabilities"] = [
  { channel: "x", publishing: "export", scheduling: false },
  { channel: "linkedin", publishing: "export", scheduling: false },
  { channel: "shortvideo", publishing: "manual", scheduling: false },
];
const input: StrategyInput = { facts, objective: "Get 20 signups from freelancers", preferredChannels: [], capabilities };

const good = {
  channels: [
    { channel: "linkedin", priority: 1, rationale: "Freelancers read LinkedIn between client projects; a cash-flow story fits there.", formats: ["problem_solution", "nonsense"], cites: ["F3", "F4"] },
    { channel: "x", priority: 2, rationale: "Short posts let each angle be tested within days with the same audience.", formats: ["thread"], cites: ["F2"] },
  ],
  messaging_angles: [{ angle: "Get paid without Wi-Fi", example_hook: "Your invoice should not wait for signal." }],
  objectives: ["Reach freelancers who invoice on the move"],
  frequency: [{ channel: "linkedin", posts_per_week: 2 }, { channel: "x", posts_per_week: 3 }, { channel: "shortvideo", posts_per_week: 1 }],
  kpis: [{ metric: "signups", target: 20, why: "The goal" }, { metric: "signups", target: 5 }],
  assumptions: [],
  // A model trying to claim abilities it does not have:
  publishing: "socialflow",
};

const completer = (outputs: string[], live = true) => {
  const reports: boolean[] = [];
  const calls: { attempt: number; prompt: string }[] = [];
  const fn: StrategyCompleter = async ({ attempt, prompt }) => {
    calls.push({ attempt, prompt: promptKey(prompt) });
    return { text: outputs[Math.min(attempt - 1, outputs.length - 1)], live, report: (v) => { reports.push(v); } };
  };
  return { fn, reports, calls };
};

describe("profile facts", () => {
  it("numbers non-empty fields and list items in order", () => {
    expect(facts.map((f) => `${f.id} ${f.label}`)).toEqual([
      "F1 Product", "F2 Value proposition", "F3 Problem", "F4 Audience", "F5 Feature", "F6 Feature",
    ]);
    expect(facts[0].text).toBe("Ledgerline: Invoicing that works offline.");
  });

  it("reads preferred channels and the objective", () => {
    expect(preferredChannels(JSON.stringify(["linkedin", "tiktok", "x"]))).toEqual(["linkedin", "x"]);
    expect(objectiveFromProfile({ goal: "first_users", goalTarget: 20, goalMetric: "signups" })).toBe("Distribution goal: first users (target: 20 signups)");
    expect(objectiveFromProfile({ goal: null })).toBe("");
  });
});

describe("strategy generation (US-042)", () => {
  it("uses a valid model strategy, citing facts, with verified capabilities overriding the model", async () => {
    const c = completer([JSON.stringify(good)]);
    const out = await generateStrategy(input, c.fn);
    expect(out.method).toBe("model");
    expect(out.prompt).toEqual({ name: "strategy", version: 1 });
    expect(c.calls).toEqual([{ attempt: 1, prompt: "strategy.v1" }]);
    expect(c.reports).toEqual([true]);
    const li = out.body.channels[0];
    expect(li).toMatchObject({ channel: "linkedin", publishing: "export", scheduling: false, formats: ["problem_solution"], cites: ["F3", "F4"] });
    expect(out.body.frequency.map((f) => f.channel)).toEqual(["linkedin", "x"]); // no frequency for a channel not recommended
    expect(out.body.kpis).toEqual([{ metric: "signups", target: 20, why: "The goal", source: "first_party" }]);
    expect(out.body.labelled_as).toBe("hypothesis");
  });

  it("rejects a citation of a fact that does not exist, retries, then labels the template", async () => {
    const bad = { ...good, channels: [{ ...good.channels[0], cites: ["F99"] }] };
    const c = completer([JSON.stringify(bad)]);
    const out = await generateStrategy(input, c.fn);
    expect(c.calls.map((x) => x.attempt)).toEqual([1, 2]);
    expect(c.reports).toEqual([false, false]);
    expect(out.method).toBe("template");
    expect(out.fallbackReason).toMatch(/unknown facts F99/);
  });

  it("refuses channels the founder did not choose", async () => {
    const onlyLinkedin = { ...input, preferredChannels: ["linkedin" as const] };
    expect(allowedChannels(onlyLinkedin)).toEqual(["linkedin"]);
    const out = await generateStrategy(onlyLinkedin, completer([JSON.stringify(good)]).fn);
    expect(out.method).toBe("template");
    expect(out.fallbackReason).toMatch(/channel x is not available/);
    expect(out.body.channels.map((c) => c.channel)).toEqual(["linkedin"]);
  });

  it("refuses KPIs Banyan cannot measure", async () => {
    const reach = { ...good, kpis: [{ metric: "impressions", target: 10000 }] };
    const out = await generateStrategy(input, completer([JSON.stringify(reach)]).fn);
    expect(out.method).toBe("template");
    expect(out.fallbackReason).toMatch(/schema/);
  });

  it("recovers on the second attempt", async () => {
    const c = completer(["not json", JSON.stringify(good)]);
    const out = await generateStrategy(input, c.fn);
    expect(out.method).toBe("model");
    expect(c.reports).toEqual([false, true]);
  });

  it("does not call twice when only the template fallback is serving", async () => {
    const c = completer([JSON.stringify(good)], false);
    const out = await generateStrategy(input, c.fn);
    expect(c.calls).toHaveLength(1);
    expect(out).toMatchObject({ method: "template", fallbackReason: "No live model available." });
  });

  it("labels the template when no model is configured", async () => {
    const out = await generateStrategy(input);
    expect(out).toMatchObject({ method: "template", prompt: null, fallbackReason: "No model provider configured." });
  });

  it("keeps SocialFlow publishing only when verified, and never assumes scheduling", async () => {
    const withSocialflow = { ...input, capabilities: capabilities.map((c) => (c.channel === "shortvideo" ? c : { ...c, publishing: "socialflow" as const })) };
    const out = await generateStrategy(withSocialflow, completer([JSON.stringify(good)]).fn);
    expect(out.body.channels.every((c) => c.publishing === "socialflow" && c.scheduling === false)).toBe(true);
  });

  it("refuses to run without facts", async () => {
    await expect(generateStrategy({ ...input, facts: [] })).rejects.toBeInstanceOf(StrategyInputError);
  });
});

describe("template strategy", () => {
  it("is grounded in facts, text channels first, with empty targets", () => {
    const t = templateStrategy(input);
    expect(t.channels.map((c) => c.channel)).toEqual(["x", "linkedin"]);
    expect(t.channels[0].cites.every((id) => facts.some((f) => f.id === id))).toBe(true);
    expect(t.kpis.every((k) => k.target === null)).toBe(true);
    expect(finalizeStrategy({ ...t, assumptions: t.assumptions }, input).ok).toBe(true);
  });
});

describe("strategy.v1 prompt", () => {
  it("is registered and fences the profile facts", () => {
    expect(getPrompt({ name: "strategy", version: 1 })).toBe(strategyV1);
    const { user } = renderPrompt(strategyV1, input);
    expect(user).toContain("F3 Problem:");
    expect(user).toContain("scheduling not available");
    expect(user).toMatch(/UNTRUSTED/i);
    expect(user).not.toContain("shortvideo (Short-form video): publishing through SocialFlow.ai");
  });
});
