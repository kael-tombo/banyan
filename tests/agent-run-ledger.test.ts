import { describe, expect, it } from "vitest";
import { RUN_QUOTA_UNITS, evaluateRunQuota, priceRunUsage } from "@/lib/model/agent-run";
import { modelPriceKnown } from "@/lib/model/quota";

/**
 * ADR-007's pure governance math: an agentic run consumes one unit of the
 * same daily quota as single-shot calls, and a run's recorded cost is a true
 * total or 0 — never a partial sum presented as the total.
 */

describe("priceRunUsage (ADR-007 decision 3)", () => {
  it("sums known prices across the models a run used", () => {
    const price = priceRunUsage([
      { model: "gpt-4o-mini", inputTokens: 1000, outputTokens: 500 }, // 150 + 300
      { model: "openai/gpt-4o-mini", inputTokens: 1000, outputTokens: 500 }, // same table entry
    ]);
    expect(price).toEqual({ inputTokens: 2000, outputTokens: 1000, estCostMicros: 900, unpricedModels: [] });
  });

  it("records 0 and names the models when any price is unknown — never a partial total", () => {
    const price = priceRunUsage([
      { model: "gpt-4o-mini", inputTokens: 1000, outputTokens: 0 },
      { model: "anthropic/claude-sonnet-5-5", inputTokens: 5000, outputTokens: 2000 },
    ]);
    expect(price.estCostMicros).toBe(0);
    expect(price.unpricedModels).toEqual(["anthropic/claude-sonnet-5-5"]);
    // Tokens are still recorded in full: the ledger keeps what it knows.
    expect(price.inputTokens).toBe(6000);
    expect(price.outputTokens).toBe(2000);
  });

  it("deduplicates unpriced model names and ignores negative token counts", () => {
    const price = priceRunUsage([
      { model: "opencode-go/glm-5.3-flash", inputTokens: -5, outputTokens: 10 },
      { model: "opencode-go/glm-5.3-flash", inputTokens: 100, outputTokens: 0 },
    ]);
    expect(price.unpricedModels).toEqual(["opencode-go/glm-5.3-flash"]);
    expect(price.inputTokens).toBe(100);
  });

  it("prices an empty run as zero with nothing unpriced", () => {
    expect(priceRunUsage([])).toEqual({ inputTokens: 0, outputTokens: 0, estCostMicros: 0, unpricedModels: [] });
  });

  it("modelPriceKnown agrees with the price table", () => {
    expect(modelPriceKnown("gpt-4o-mini")).toBe(true);
    expect(modelPriceKnown("opencode-go/glm-5.3-flash")).toBe(false);
  });
});

describe("evaluateRunQuota (ADR-007 decision 1)", () => {
  it("one run consumes exactly one quota unit", () => {
    expect(RUN_QUOTA_UNITS).toBe(1);
  });

  it("admits a run while a slot is free and reserves it from `remaining`", () => {
    const d = evaluateRunQuota({ liveModelActionsToday: 4, limitPerDay: 5 });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(0); // 5 - 4 used - 1 for this run
  });

  it("refuses a run once the allowance is used, with the template-path reason", () => {
    const d = evaluateRunQuota({ liveModelActionsToday: 5, limitPerDay: 5 });
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
    expect(d.reason).toMatch(/quota reached/i);
    expect(d.reason).toMatch(/template/i);
  });

  it("counts completed runs and single-shot calls from the same ledger", () => {
    // 2 calls + 2 recorded runs = 4 live actions; one slot left of 5.
    expect(evaluateRunQuota({ liveModelActionsToday: 2 + 2, limitPerDay: 5 }).allowed).toBe(true);
    expect(evaluateRunQuota({ liveModelActionsToday: 2 + 3, limitPerDay: 5 }).allowed).toBe(false);
  });

  it("never admits a run against a zero limit", () => {
    expect(evaluateRunQuota({ liveModelActionsToday: 0, limitPerDay: 0 }).allowed).toBe(false);
  });
});
