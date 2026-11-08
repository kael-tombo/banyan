import { describe, it, expect } from "vitest";
import { budgetUsed } from "@/lib/credits/ledger";
import { BudgetExceededError, InsufficientCreditsError } from "@/lib/credits/service";
import { draftHoldKey, goalDraftPrefix, refusal, WORKFLOW_DRAFT_CREDITS } from "@/lib/credits/draft-charge";

describe("workflow draft credits (R4)", () => {
  it("a draft costs one credit, like a draft from a strategy", () => {
    expect(WORKFLOW_DRAFT_CREDITS).toBe(1);
  });

  it("every hold of a goal's drafts falls under that goal's budget, and only that goal's", () => {
    const key = draftHoldKey("g1", "t1", 2);
    expect(key.startsWith(goalDraftPrefix("g1"))).toBe(true);
    expect(key.startsWith(goalDraftPrefix("g10"))).toBe(false);
    expect(draftHoldKey(null, "t1", 1).startsWith("goal:")).toBe(false);
  });

  it("each attempt is its own hold, so a retry after a returned hold is charged anew", () => {
    expect(draftHoldKey("g", "t", 1)).not.toBe(draftHoldKey("g", "t", 2));
    expect(draftHoldKey("g", "t", 1)).toBe(draftHoldKey("g", "t", 1));
  });

  it("a returned hold does not count against the budget", () => {
    expect(budgetUsed([{ kind: "reserve", amount: 1 }, { kind: "release", amount: 1 }, { kind: "reserve", amount: 1 }, { kind: "settle", amount: 1 }])).toBe(1);
  });

  it("an exceeded budget and a short balance each tell the founder what to change", () => {
    const b = refusal(new BudgetExceededError(5, 5));
    expect(b?.reason).toContain("5 of the 5-credit budget");
    // The goal route re-queues tasks whose block mentions this phrase when the budget is raised.
    expect(b?.reason).toContain("credit budget");
    expect(b?.actionable).toMatch(/goal page/);
    const c = refusal(new InsufficientCreditsError(1, 0));
    expect(c?.reason).toContain("Nothing was started");
    expect(c?.actionable).toMatch(/Credits page/);
    expect(refusal(new Error("db down"))).toBeNull();
  });
});
