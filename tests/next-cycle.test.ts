import { describe, it, expect } from "vitest";
import { nextCycleFrom, windowDays, DEFAULT_WINDOW_DAYS, type PreviousGoal } from "@/lib/next-cycle";

const NOW = new Date("2026-11-20T10:00:00Z");
const prev: PreviousGoal = {
  id: "g1",
  objective: "20 qualified signups in 14 days",
  successMetric: "signups",
  metricTarget: 20,
  metricUnit: null,
  createdAt: new Date("2026-11-01T10:00:00Z"),
  deadline: new Date("2026-11-15T10:00:00Z"),
  constraints: "founder voice only; channels: linkedin, x",
};
const rec = { id: "r1", title: "Lead with getting paid, and test LinkedIn first", rationale: "3 of 4 signups came through the LinkedIn post about payment.", confidence: "low" };

describe("next cycle", () => {
  it("carries every earlier decision and adds exactly one change", () => {
    const n = nextCycleFrom(prev, rec, NOW);
    expect(n).toMatchObject({ objective: prev.objective, successMetric: "signups", metricTarget: 20, metricUnit: null });
    expect(n.constraints).toBe("founder voice only; channels: linkedin, x; change from last cycle: Lead with getting paid, and test LinkedIn first");
    expect(n.description).toContain("low confidence");
    expect(n.description).toContain("3 of 4 signups");
  });

  it("keeps the channel constraint the strategy handler reads", () => {
    expect(nextCycleFrom(prev, rec, NOW).constraints).toContain("channels: linkedin, x");
  });

  it("keeps the same window length, starting now", () => {
    const n = nextCycleFrom(prev, rec, NOW);
    expect(n.deadline.toISOString()).toBe("2026-12-04T10:00:00.000Z");
    expect(windowDays({ deadline: null, createdAt: NOW })).toBe(DEFAULT_WINDOW_DAYS);
  });

  it("replaces, not stacks, the change from an earlier cycle", () => {
    const second = nextCycleFrom({ ...prev, constraints: nextCycleFrom(prev, rec, NOW).constraints }, { ...rec, title: "Post on Tuesdays" }, NOW);
    expect(second.constraints.match(/change from last cycle/g)).toHaveLength(1);
    expect(second.constraints).toContain("Post on Tuesdays");
    expect(second.constraints).toContain("channels: linkedin, x");
  });

  it("stays within the goal fields' limits", () => {
    const long = nextCycleFrom({ ...prev, objective: "o".repeat(400), constraints: "c".repeat(600) }, { ...rec, title: "t".repeat(400), rationale: "r".repeat(2000) }, NOW);
    expect(long.objective.length).toBeLessThanOrEqual(300);
    expect(long.constraints.length).toBeLessThanOrEqual(500);
    expect(long.description.length).toBeLessThanOrEqual(1000);
    expect(long.rawInput.length).toBeGreaterThanOrEqual(10);
  });
});
