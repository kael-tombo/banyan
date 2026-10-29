import { describe, expect, it } from "vitest";
import { buildDescent, buildLearningRings } from "@/lib/goal-descent";

describe("buildDescent — the five beats of a goal's loop", () => {
  it("reports every stage empty before the planner drafts", () => {
    const stages = buildDescent({
      planStatus: null,
      runningTasks: 0,
      queuedTasks: 0,
      waitingGates: 0,
      completedTasks: 0,
      openRecommendations: 0,
      concludedExperiments: 0,
    });
    expect(stages.map((s) => s.state)).toEqual(["empty", "empty", "done", "empty", "empty"]);
    expect(stages.find((s) => s.key === "plan")?.hint).toMatch(/drafting/);
  });

  it("marks the plan waiting while a human decision is required", () => {
    const stages = buildDescent({
      planStatus: "planned",
      runningTasks: 0,
      queuedTasks: 0,
      waitingGates: 0,
      completedTasks: 0,
      openRecommendations: 0,
      concludedExperiments: 0,
    });
    const plan = stages.find((s) => s.key === "plan")!;
    expect(plan.state).toBe("waiting");
    expect(plan.hint).toMatch(/Awaiting your decision \(planned\)/);
  });

  it("keeps gates at a true zero and marks branches moving when work runs", () => {
    const stages = buildDescent({
      planStatus: "approved",
      runningTasks: 3,
      queuedTasks: 2,
      waitingGates: 0,
      completedTasks: 1,
      openRecommendations: 0,
      concludedExperiments: 0,
    });
    const branches = stages.find((s) => s.key === "branches")!;
    const gates = stages.find((s) => s.key === "gates")!;
    expect(branches.state).toBe("moving");
    expect(branches.count).toBe(5); // running + queued are both real work
    expect(gates.state).toBe("done"); // a true zero is a good state, not an empty one
    expect(gates.hint).toMatch(/true zero/);
  });

  it("turns the learning stage on only from measured outcomes or proposals", () => {
    const base = {
      planStatus: "approved",
      runningTasks: 0,
      queuedTasks: 0,
      waitingGates: 0,
      completedTasks: 0,
      openRecommendations: 0,
      concludedExperiments: 0,
    };
    expect(buildDescent(base).find((s) => s.key === "learning")!.state).toBe("empty");
    const withExperiment = buildDescent({ ...base, concludedExperiments: 1 });
    expect(withExperiment.find((s) => s.key === "learning")!.state).toBe("moving");
    const withProposal = buildDescent({ ...base, openRecommendations: 2 });
    expect(withProposal.find((s) => s.key === "learning")!.state).toBe("moving");
  });
});

describe("buildLearningRings — only real decisions become rings", () => {
  const t = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

  it("returns no rings from an empty source", () => {
    expect(
      buildLearningRings({ plan: null, gatePasses: [], experiments: [], recommendations: [] }),
    ).toEqual([]);
  });

  it("does not count a plan as approved without a recorded approval date", () => {
    const rings = buildLearningRings({
      plan: { approvedAt: null, approvedByName: "Founder" },
      gatePasses: [],
      experiments: [],
      recommendations: [],
    });
    expect(rings).toEqual([]);
  });

  it("keeps the plan approval with who recorded it", () => {
    const rings = buildLearningRings({
      plan: { approvedAt: t(3), approvedByName: "Founder" },
      gatePasses: [],
      experiments: [],
      recommendations: [],
    });
    expect(rings).toHaveLength(1);
    expect(rings[0].kind).toBe("plan_approved");
    expect(rings[0].detail).toContain("Founder");
  });

  it("sorts rings newest first and caps the list", () => {
    const gate = (i: number) => ({
      id: `g${i}`,
      title: `Gate ${i}`,
      completedAt: t(i),
      updatedAt: t(i),
    });
    const rings = buildLearningRings(
      {
        plan: { approvedAt: t(1), approvedByName: null },
        gatePasses: [gate(2), gate(5), gate(9)],
        experiments: [
          {
            id: "e1",
            title: "Exp",
            status: "complete",
            decidedAt: t(4),
            updatedAt: t(4),
            interpretation: "Hook-first posts held attention longer.",
          },
        ],
        recommendations: [
          {
            id: "r1",
            title: "Double down on launch threads",
            status: "acted_upon",
            confidence: "medium",
            updatedAt: t(0),
          },
          {
            id: "r2",
            title: "Open proposal — must not become a ring",
            status: "open",
            confidence: "low",
            updatedAt: t(0),
          },
        ],
      },
      4,
    );
    expect(rings.map((r) => r.kind)).toEqual([
      "recommendation", // t(0)
      "plan_approved", // t(1)
      "gate_passed", // t(2)
      "experiment_concluded", // t(4)
    ]);
    expect(rings[3].detail).toContain("Hook-first");
    expect(rings).toHaveLength(4); // capped
  });

  it("includes dismissed recommendations as kept learning — a decision is learning", () => {
    const rings = buildLearningRings({
      plan: null,
      gatePasses: [],
      experiments: [],
      recommendations: [
        {
          id: "r1",
          title: "Chase short-video",
          status: "dismissed",
          confidence: "low",
          updatedAt: t(2),
        },
      ],
    });
    expect(rings).toHaveLength(1);
    expect(rings[0].status).toBe("dismissed");
    expect(rings[0].title).toContain("deliberately dismissed");
  });

  it("falls back to the experiment title when no interpretation was drafted", () => {
    const rings = buildLearningRings({
      plan: null,
      gatePasses: [],
      experiments: [
        {
          id: "e1",
          title: "LinkedIn cadence test",
          status: "complete",
          decidedAt: t(1),
          updatedAt: t(1),
          interpretation: "  ",
        },
      ],
      recommendations: [],
    });
    expect(rings[0].detail).toMatch(/LinkedIn cadence test concluded/);
  });
});
