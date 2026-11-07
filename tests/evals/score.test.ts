import { describe, it, expect } from "vitest";
import { EVAL_PRODUCTS } from "./products";
import { hookOf, hookOverlap, scoreDraft } from "./score";

const ledgerline = EVAL_PRODUCTS.find((p) => p.id === "ledgerline")!;

describe("eval scoring", () => {
  it("passes a grounded, clean, live LinkedIn post", () => {
    const s = scoreDraft(ledgerline, {
      channel: "linkedin",
      format: "problem_solution",
      isFallback: false,
      label: "Live model",
      body: "You finish the job on a train with no signal, and the invoice waits.\n\nLedgerline queues invoices offline and sends them the moment you are back online. Public beta is open.",
    });
    expect(s.problems).toEqual([]);
  });

  it("flags invented numbers, avoided terms, meta-commentary and the template", () => {
    const s = scoreDraft(ledgerline, {
      channel: "linkedin",
      format: "insight",
      isFallback: true,
      label: "Template",
      body: "Here's a post:\n**Ledgerline** is a revolutionary tool trusted by 5,000 freelancers who now get paid 3x faster.",
    });
    expect(s.live).toBe(false);
    expect(s.bannedTerms).toContain("revolutionary");
    expect(s.inventedClaims.length).toBeGreaterThan(0);
    expect(s.cleanOutput).toBe(false);
  });

  it("flags an X single post over 280 characters", () => {
    const s = scoreDraft(ledgerline, { channel: "x", format: "single", isFallback: false, label: "", body: "Ledgerline invoices offline and syncs online. ".repeat(10) });
    expect(s.withinLimits).toBe(false);
  });

  it("measures hook overlap on the opening line, ignoring thread numbering", () => {
    expect(hookOf("1/ No signal, no invoice? Not any more.\n\n2/ More")).toBe("No signal, no invoice?");
    expect(hookOverlap("1/ Your invoice should not wait for signal.", "Your invoice should not wait for signal. Ever.")).toBeGreaterThan(0.5);
    expect(hookOverlap("1/ Trains have no Wi-Fi.", "Freelancers lose a week of cash flow to late invoices.")).toBeLessThan(0.2);
  });

  it("has ten products, each with evidence and fact words", () => {
    expect(EVAL_PRODUCTS).toHaveLength(10);
    for (const p of EVAL_PRODUCTS) {
      expect(p.campaign.evidence.length).toBeGreaterThan(10);
      expect(p.factWords.length).toBeGreaterThanOrEqual(4);
    }
  });
});
