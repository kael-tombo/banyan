import { describe, it, expect } from "vitest";
import {
  computeFunnelStages,
  experimentOutcomeRows,
  channelPerformanceRows,
  dataHealthRows,
  recentDecisionRows,
} from "@/lib/results";

describe("computeFunnelStages", () => {
  it("computes stages with shares and deltas", () => {
    const stages = computeFunnelStages(
      { visits: 200, signups: 20, activated: 5 },
      { visits: 100, signups: 10, activated: 4 }
    );
    expect(stages.map((s) => s.count)).toEqual([200, 20, 5]);
    expect(stages[1].shareOfPrevPct).toBe(10);
    expect(stages[2].shareOfPrevPct).toBe(25);
    expect(stages[0].deltaPct).toBe(100);
    expect(stages[1].deltaPct).toBe(100);
  });

  it("returns null (unknown), not 0%, when the previous period was zero", () => {
    const stages = computeFunnelStages({ visits: 50, signups: 5, activated: 1 }, { visits: 0, signups: 0, activated: 0 });
    for (const s of stages) expect(s.deltaPct).toBeNull();
  });

  it("returns null conversion share when the upstream stage is zero", () => {
    const stages = computeFunnelStages({ visits: 0, signups: 5, activated: 1 }, { visits: 0, signups: 0, activated: 0 });
    expect(stages[1].shareOfPrevPct).toBeNull();
  });
});

const baseExperiment = {
  id: "exp1",
  title: "Pain-led landing page",
  channel: "linkedin",
  successMetric: "signups",
  results: null,
  interpretation: null,
  limitations: null,
  nextAction: null,
  metricsSnapshot: null,
  decidedAt: null,
};

describe("experimentOutcomeRows", () => {
  it("classifies a running experiment as running with no verdict", () => {
    const rows = experimentOutcomeRows([{ ...baseExperiment, status: "running" }]);
    expect(rows[0].signal).toBe("running");
    expect(rows[0].confidence).toBe("unknown");
    expect(rows[0].signalDetail).toContain("no verdict");
  });

  it("extracts the success metric from the snapshot and marks measured", () => {
    const rows = experimentOutcomeRows([
      {
        ...baseExperiment,
        status: "complete",
        metricsSnapshot: JSON.stringify({
          clickTotal: 612,
          publications: 2,
          metrics: [{ metric: "signups", value: 41, source: "manual" }],
        }),
        interpretation: "Directionally positive",
        nextAction: "Continue the test",
        decidedAt: new Date("2026-05-01"),
      },
    ]);
    expect(rows[0].signal).toBe("measured");
    expect(rows[0].primaryMetric).toEqual({ metric: "signups", value: 41, source: "manual" });
    expect(rows[0].confidence).toBe("medium");
    expect(rows[0].decision).toBe("Continue the test");
    expect(rows[0].keyResults).toContain("612 tracked click(s)");
  });

  it("prefers the declared success metric over the first metric", () => {
    const rows = experimentOutcomeRows([
      {
        ...baseExperiment,
        status: "complete",
        successMetric: "trials",
        metricsSnapshot: JSON.stringify({
          metrics: [
            { metric: "signups", value: 30, source: "manual" },
            { metric: "qualified trials", value: 4, source: "manual" },
          ],
        }),
      },
    ]);
    expect(rows[0].primaryMetric?.metric).toBe("qualified trials");
  });

  it("stays honest when a completed experiment has no snapshot", () => {
    const rows = experimentOutcomeRows([{ ...baseExperiment, status: "complete", results: "some text" }]);
    expect(rows[0].signal).toBe("no_data");
    expect(rows[0].confidence).toBe("low");
  });

  it("tolerates a corrupt snapshot without throwing", () => {
    const rows = experimentOutcomeRows([{ ...baseExperiment, status: "complete", metricsSnapshot: "{not json" }]);
    expect(rows[0].signal).toBe("no_data");
  });
});

describe("channelPerformanceRows", () => {
  it("ranks by downstream outcomes and labels strength from absolute counts", () => {
    const rows = channelPerformanceRows([
      { campaignId: "a", campaignName: "Guides", channelLabel: "Search", clicks: 300, signups: 20, activations: 6 },
      { campaignId: "b", campaignName: "Demos", channelLabel: "Video", clicks: 120, signups: 5, activations: 2 },
      { campaignId: "c", campaignName: "Posts", channelLabel: "LinkedIn", clicks: 40, signups: 1, activations: 0 },
      { campaignId: "d", campaignName: "Ads", channelLabel: null, clicks: 0, signups: 0, activations: 0 },
    ]);
    expect(rows.map((r) => r.campaignId)).toEqual(["a", "b", "c", "d"]);
    expect(rows[0].signalStrength).toBe("strong");
    expect(rows[1].signalStrength).toBe("moderate");
    expect(rows[2].signalStrength).toBe("early");
    expect(rows[3].signalStrength).toBe("none");
  });

  it("calls signups-without-activation early, not strong", () => {
    const rows = channelPerformanceRows([
      { campaignId: "a", campaignName: "X", channelLabel: "X", clicks: 50, signups: 9, activations: 0 },
    ]);
    expect(rows[0].signalStrength).toBe("early");
    expect(rows[0].strengthDetail).toContain("without recorded activation");
  });
});

describe("dataHealthRows", () => {
  it("reports a missing publishing provider as not_connected", () => {
    const rows = dataHealthRows({ connections: [], attributionPct: null, unattributedSignups: 0, activationSharePct: null });
    expect(rows[0]).toMatchObject({ key: "publishing", status: "not_connected" });
  });

  it("maps connection states honestly", () => {
    const rows = dataHealthRows({
      connections: [
        { label: "SocialFlow", status: "verified", lastCheckedAt: new Date() },
        { label: "SocialFlow 2", status: "configured", lastCheckedAt: null },
        { label: "SocialFlow 3", status: "error", lastCheckedAt: new Date() },
      ],
      attributionPct: 72,
      unattributedSignups: 14,
      activationSharePct: 26,
    });
    expect(rows.find((r) => r.key === "conn-SocialFlow")?.status).toBe("connected");
    expect(rows.find((r) => r.key === "conn-SocialFlow 2")?.status).toBe("degraded");
    expect(rows.find((r) => r.key === "conn-SocialFlow 3")?.status).toBe("degraded");
  });

  it("says coverage is unknown with no signups, degraded with gaps", () => {
    const noSignups = dataHealthRows({ connections: [], attributionPct: null, unattributedSignups: 0, activationSharePct: null });
    expect(noSignups.find((r) => r.key === "attribution")?.detail).toContain("unknown");

    const gaps = dataHealthRows({ connections: [], attributionPct: 72, unattributedSignups: 14, activationSharePct: 26 });
    expect(gaps.find((r) => r.key === "attribution")?.status).toBe("degraded");
    expect(gaps.find((r) => r.key === "attribution")?.detail).toContain("14");
  });
});

describe("recentDecisionRows", () => {
  it("collects plan approvals, experiment conclusions, accepted opportunities, sorted desc", () => {
    const t1 = new Date("2026-05-10T09:00:00Z");
    const t2 = new Date("2026-05-08T09:00:00Z");
    const t3 = new Date("2026-05-05T09:00:00Z");
    const rows = recentDecisionRows({
      plans: [{ goalId: "g1", goalObjective: "Reach 100 trials", summary: "Three phases", approvedAt: t2, approverName: "Jordan" }],
      experiments: [{ title: "Landing test", nextAction: "Replicate the message", interpretation: null, decidedAt: t1 }],
      recommendations: [
        { title: "Expand the guide", rationale: "Positive signal", status: "accepted", updatedAt: t3, confidence: 0.6 },
        { title: "Dismissed idea", rationale: "Weak", status: "dismissed", updatedAt: t1, confidence: null },
      ],
    });
    expect(rows).toHaveLength(3);
    expect(rows[0].action).toContain("Experiment concluded");
    expect(rows[1].action).toContain("Plan approved");
    expect(rows[2].action).toContain("accepted");
    expect(rows[0].href).toBe("/app/experiments");
    expect(rows[1].href).toBe("/app/goals/g1");
  });

  it("skips undecided experiments and unapproved plans", () => {
    const rows = recentDecisionRows({
      plans: [{ goalId: "g1", goalObjective: "G", summary: null, approvedAt: null, approverName: null }],
      experiments: [{ title: "E", nextAction: null, interpretation: null, decidedAt: null }],
      recommendations: [],
    });
    expect(rows).toHaveLength(0);
  });
});
