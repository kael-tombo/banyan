import { describe, it, expect } from "vitest";
import { reviewDecision, validateEditedBody, diffStrategies } from "@/lib/strategy/review";
import { templateStrategy, type StrategyInput, type StrategyBody } from "@/lib/strategy/generate";
import { profileFacts } from "@/lib/strategy/facts";

const facts = profileFacts({ name: "Ledgerline", description: "Invoicing that works offline.", valueProp: "Send invoices from anywhere.", problem: "Freelancers cannot invoice without signal.", audience: "Freelancers" });
const input: StrategyInput = {
  facts,
  objective: "",
  preferredChannels: [],
  capabilities: [
    { channel: "x", publishing: "export", scheduling: false },
    { channel: "linkedin", publishing: "export", scheduling: false },
    { channel: "shortvideo", publishing: "manual", scheduling: false },
  ],
};
const base = templateStrategy(input);
const asDraft = (b: StrategyBody) => ({
  channels: b.channels.map(({ channel, priority, rationale, formats, cites }) => ({ channel, priority, rationale, formats, cites })),
  messaging_angles: b.messaging_angles,
  objectives: b.objectives,
  frequency: b.frequency,
  kpis: b.kpis.map(({ metric, target, why }) => ({ metric, target, why })),
  assumptions: b.assumptions,
});

describe("review transitions (US-043)", () => {
  it("approves a proposal, and approving again is a no-op", () => {
    expect(reviewDecision("proposed", "approve")).toEqual({ ok: true });
    expect(reviewDecision("approved", "approve")).toEqual({ ok: true, idempotent: true });
  });

  it("refuses to approve a stale, rejected or superseded strategy", () => {
    expect(reviewDecision("proposed", "approve", { stale: true })).toMatchObject({ ok: false, reason: expect.stringMatching(/Regenerate/) });
    expect(reviewDecision("rejected", "approve").ok).toBe(false);
    expect(reviewDecision("superseded", "approve").ok).toBe(false);
  });

  it("rejects only proposals", () => {
    expect(reviewDecision("proposed", "reject")).toEqual({ ok: true });
    expect(reviewDecision("rejected", "reject")).toEqual({ ok: true, idempotent: true });
    expect(reviewDecision("approved", "reject").ok).toBe(false);
  });
});

describe("edited strategies follow the generation rules", () => {
  it("accepts a valid edit and re-attaches verified capabilities", () => {
    const edit = asDraft(base);
    edit.frequency = edit.frequency.map((f) => ({ ...f, posts_per_week: 5 }));
    const out = validateEditedBody(edit, input);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.body.channels.every((c) => c.publishing === "export" && !c.scheduling)).toBe(true);
  });

  it("refuses a citation outside the fact snapshot", () => {
    const edit = asDraft(base);
    edit.channels[0].cites = ["F42"];
    expect(validateEditedBody(edit, input)).toMatchObject({ ok: false, problems: [expect.stringMatching(/F42/)] });
  });

  it("refuses an unmeasurable KPI and malformed input", () => {
    const edit = { ...asDraft(base), kpis: [{ metric: "followers", target: 1000 }] };
    expect(validateEditedBody(edit, input).ok).toBe(false);
    expect(validateEditedBody({ channels: "linkedin" }, input).ok).toBe(false);
  });
});

describe("version diff reads as sentences", () => {
  it("names added channels, cadence and target changes", () => {
    const next: StrategyBody = {
      ...base,
      channels: [...base.channels, { ...base.channels[0], channel: "shortvideo", priority: 3, formats: ["hook"] }],
      frequency: base.frequency.map((f) => (f.channel === "x" ? { ...f, posts_per_week: 5 } : f)),
      kpis: base.kpis.map((k) => (k.metric === "signups" ? { ...k, target: 20 } : k)),
    };
    const changes = diffStrategies(base, next);
    expect(changes).toContain("Added Short-form video.");
    expect(changes).toContain("X: 3 → 5 posts a week.");
    expect(changes).toContain("Signups target: none → 20.");
  });

  it("is empty for identical versions", () => {
    expect(diffStrategies(base, base)).toEqual([]);
  });
});
