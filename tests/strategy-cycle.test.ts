import { describe, it, expect } from "vitest";
import { cycleDraftFromStrategy, primaryKpi, strategyCycleProgress, CYCLE_WINDOW_DAYS } from "@/lib/cycle/strategy-cycle";

const NOW = new Date("2026-11-02T09:00:00Z");
const body = (b: object) => JSON.stringify(b);

describe("strategy cycle", () => {
  it("takes signups as the primary KPI when tracked, else the first KPI", () => {
    expect(primaryKpi({ kpis: [{ metric: "tracked_visits", target: 200 }, { metric: "signups", target: 20 }] })).toEqual({ metric: "signups", target: 20 });
    expect(primaryKpi({ kpis: [{ metric: "tracked_visits", target: null }] })).toEqual({ metric: "tracked_visits", target: null });
    expect(primaryKpi({})).toEqual({ metric: "signups", target: null });
  });

  it("opens the cycle with the strategy's objective, KPI, channels and a fixed window", () => {
    const d = cycleDraftFromStrategy(
      { version: 3, objective: "Reach technical founders (success metric: signups)", body: body({ channels: [{ channel: "linkedin" }, { channel: "x" }, { channel: "x" }], kpis: [{ metric: "signups", target: 20 }] }) },
      NOW
    );
    expect(d).toMatchObject({ objective: "Reach technical founders", successMetric: "signups", metricTarget: 20, constraints: "channels: linkedin, x" });
    expect(d.deadline.getTime() - NOW.getTime()).toBe(CYCLE_WINDOW_DAYS * 86_400_000);
    expect(d.rawInput).toContain("strategy v3");
  });

  it("survives a malformed body and an empty objective", () => {
    const d = cycleDraftFromStrategy({ version: 1, objective: "", body: "not json" }, NOW);
    expect(d).toMatchObject({ objective: "Distribute the approved strategy", successMetric: "signups", constraints: "" });
  });

  it("measures progress as the published share of live drafts", () => {
    expect(strategyCycleProgress([])).toBe(0);
    expect(strategyCycleProgress(["published", "approved", "rejected"])).toBe(50);
    expect(strategyCycleProgress(["published", "published"])).toBe(100);
  });
});
