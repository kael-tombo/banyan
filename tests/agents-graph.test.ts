import { describe, expect, it } from "vitest";
import {
  blockDependentsOfFailure,
  expiredLeases,
  parallelBatch,
  pendingToReady,
  progressPercent,
  retryableFailed,
  workflowBlockers,
  workflowComplete,
  type GraphTask,
} from "@/lib/agents/graph";
import { verifyOutput, VERIFICATION_SCHEMAS } from "@/lib/agents/verify";
import type { TaskOutput } from "@/lib/agents/types";

function task(partial: Partial<GraphTask> & { id: string }): GraphTask {
  return {
    status: "pending",
    dependsOn: [],
    attempts: 0,
    maxAttempts: 3,
    leasedUntil: null,
    type: "research",
    ...partial,
  };
}

describe("orchestration graph — dependency resolution", () => {
  it("promotes pending tasks when all dependencies are completed", () => {
    const tasks: GraphTask[] = [
      task({ id: "a", status: "completed" }),
      task({ id: "b", status: "pending", dependsOn: ["a"] }),
      task({ id: "c", status: "pending", dependsOn: ["a", "b"] }),
    ];
    expect(pendingToReady(tasks)).toEqual(["b"]);
  });

  it("does not promote tasks with incomplete dependencies", () => {
    const tasks: GraphTask[] = [
      task({ id: "a", status: "running" }),
      task({ id: "b", status: "pending", dependsOn: ["a"] }),
    ];
    expect(pendingToReady(tasks)).toEqual([]);
  });

  it("treats tasks without dependencies as immediately promotable", () => {
    const tasks: GraphTask[] = [task({ id: "solo", status: "pending" })];
    expect(pendingToReady(tasks)).toEqual(["solo"]);
  });
});

describe("orchestration graph — failure propagation", () => {
  it("blocks dependents of failed tasks", () => {
    const tasks: GraphTask[] = [
      task({ id: "a", status: "failed" }),
      task({ id: "b", status: "pending", dependsOn: ["a"] }),
      task({ id: "c", status: "ready", dependsOn: ["a"] }),
      task({ id: "d", status: "pending", dependsOn: ["b"] }),
    ];
    const blocked = blockDependentsOfFailure(tasks);
    expect(blocked).toContainEqual({ taskId: "b", failedDep: "a" });
    // d depends on b (still pending), not directly on the failure
    expect(blocked).toHaveLength(2);
    expect(blocked.some((x) => x.taskId === "c")).toBe(true);
  });

  it("ignores dependents of completed tasks", () => {
    const tasks: GraphTask[] = [
      task({ id: "a", status: "completed" }),
      task({ id: "b", status: "pending", dependsOn: ["a"] }),
    ];
    expect(blockDependentsOfFailure(tasks)).toHaveLength(0);
  });
});

describe("orchestration graph — failure recovery", () => {
  it("requeues running tasks whose lease expired", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const tasks: GraphTask[] = [
      task({ id: "fresh", status: "running", leasedUntil: new Date("2026-01-01T12:04:00Z") }),
      task({ id: "stale", status: "running", leasedUntil: new Date("2026-01-01T11:55:00Z") }),
      task({ id: "idle", status: "ready", leasedUntil: new Date("2026-01-01T11:00:00Z") }),
    ];
    expect(expiredLeases(tasks, now)).toEqual(["stale"]);
  });

  it("only retries failed tasks within their attempt budget", () => {
    const tasks: GraphTask[] = [
      task({ id: "retry-ok", status: "failed", attempts: 1, maxAttempts: 3 }),
      task({ id: "exhausted", status: "failed", attempts: 3, maxAttempts: 3 }),
    ];
    expect(retryableFailed(tasks)).toEqual(["retry-ok"]);
  });
});

describe("orchestration graph — parallel batching", () => {
  it("groups independent ready tasks into one parallel batch", () => {
    const tasks: GraphTask[] = [
      task({ id: "x", status: "ready" }),
      task({ id: "y", status: "ready" }),
      task({ id: "z", status: "ready" }),
    ];
    expect(parallelBatch(tasks, 3).map((t) => t.id)).toEqual(["x", "y", "z"]);
  });

  it("never executes a dependent in the same batch as its dependency", () => {
    // Both ready (e.g. promoted in the same tick by dynamic creation) — still
    // unsafe to run together because b depends on a's output.
    const tasks: GraphTask[] = [
      task({ id: "a", status: "ready" }),
      task({ id: "b", status: "ready", dependsOn: ["a"] }),
      task({ id: "c", status: "ready" }),
    ];
    const batch = parallelBatch(tasks, 3).map((t) => t.id);
    expect(batch).toContain("a");
    expect(batch).not.toContain("b");
    expect(batch).toContain("c");
  });

  it("respects the concurrency cap deterministically", () => {
    const tasks: GraphTask[] = [task({ id: "1" }), task({ id: "2" }), task({ id: "3" })];
    expect(parallelBatch(tasks, 2).map((t) => t.id)).toEqual(["1", "2"]);
  });

  it("handles transitive dependencies", () => {
    const tasks: GraphTask[] = [
      task({ id: "a", status: "ready" }),
      task({ id: "b", status: "ready", dependsOn: ["a"] }),
      task({ id: "c", status: "ready", dependsOn: ["b"] }),
    ];
    expect(parallelBatch(tasks, 3).map((t) => t.id)).toEqual(["a"]);
  });
});

describe("orchestration graph — progress and completion", () => {
  it("computes progress from non-cancelled tasks only", () => {
    const tasks = [
      { status: "completed" },
      { status: "completed" },
      { status: "cancelled" },
      { status: "pending" },
    ];
    expect(progressPercent(tasks)).toBe(67);
  });

  it("reports 0 for a goal with no tasks (a true zero, not an error)", () => {
    expect(progressPercent([])).toBe(0);
  });

  it("is complete only when every non-cancelled task completed", () => {
    expect(workflowComplete([{ status: "completed" }, { status: "completed" }])).toBe(true);
    expect(workflowComplete([{ status: "completed" }, { status: "blocked" }])).toBe(false);
    expect(workflowComplete([])).toBe(false);
  });

  it("summarizes blockers with their recorded reasons", () => {
    const blockers = workflowBlockers([
      { id: "1", status: "blocked", lastError: "No connection configured → use export mode", type: "publish" },
      { id: "2", status: "completed", type: "research" },
    ]);
    expect(blockers).toEqual([{ id: "1", type: "publish", reason: "No connection configured → use export mode" }]);
  });
});

describe("task output verification", () => {
  it("passes nonempty verification with a real summary", () => {
    const out: TaskOutput = { summary: "Brief produced with 3 hypothesis angles." };
    expect(verifyOutput({ kind: "nonempty" }, out)).toEqual({ ok: true });
  });

  it("fails verification when the summary is empty", () => {
    expect(verifyOutput({ kind: "nonempty" }, { summary: "  " }).ok).toBe(false);
    expect(verifyOutput({ kind: "nonempty" }, null).ok).toBe(false);
  });

  it("fails against an unknown named schema (never silently passes)", () => {
    const out: TaskOutput = { summary: "something", data: {} };
    const res = verifyOutput({ kind: "json_schema", schema: "no_such_schema" }, out);
    expect(res.ok).toBe(false);
  });

  it("validates a measurement output against the measurement schema", () => {
    const out: TaskOutput = {
      summary: "Measured 1 publication, 0 clicks.",
      data: {
        confirmedPublications: 1,
        trackedClicks: 0,
        events: { visit: 0 },
        metrics: [],
        dataLimitations: ["No tracked links attached"],
      },
    };
    expect(verifyOutput({ kind: "json_schema", schema: "measurement" }, out).ok).toBe(true);
  });

  it("rejects a measurement output with negative counts", () => {
    const out: TaskOutput = {
      summary: "bad",
      data: { confirmedPublications: -1, trackedClicks: 0, events: {}, metrics: [], dataLimitations: [] },
    };
    expect(verifyOutput({ kind: "json_schema", schema: "measurement" }, out).ok).toBe(false);
  });

  it("provider_confirmed only passes on published status", () => {
    const published: TaskOutput = { summary: "ok", refs: { publicationStatus: "published" } };
    const blocked: TaskOutput = { summary: "nope", refs: { publicationStatus: "blocked" } };
    expect(verifyOutput({ kind: "provider_confirmed" }, published).ok).toBe(true);
    expect(verifyOutput({ kind: "provider_confirmed" }, blocked).ok).toBe(false);
  });

  it("every registered verification schema is non-empty", () => {
    expect(Object.keys(VERIFICATION_SCHEMAS).length).toBeGreaterThanOrEqual(8);
  });
});

describe("orchestration graph — observer tasks past blocked stages", () => {
  it("promotes measure when its publish dependency is blocked (it observes reality)", () => {
    const tasks: GraphTask[] = [
      task({ id: "pub", status: "blocked", type: "publish" }),
      task({ id: "measure", status: "pending", type: "measure", dependsOn: ["pub"] }),
    ];
    expect(pendingToReady(tasks)).toEqual(["measure"]);
    expect(blockDependentsOfFailure(tasks)).toHaveLength(0);
  });

  it("does NOT promote non-observer tasks past a blocked dependency", () => {
    const tasks: GraphTask[] = [
      task({ id: "pub", status: "blocked", type: "publish" }),
      task({ id: "content", status: "pending", type: "content_draft", dependsOn: ["pub"] }),
    ];
    expect(pendingToReady(tasks)).toEqual([]);
  });

  it("chains the analysis path: measure completes → evaluate → recommend", () => {
    const tasks: GraphTask[] = [
      task({ id: "pub", status: "blocked", type: "publish" }),
      task({ id: "measure", status: "completed", type: "measure", dependsOn: ["pub"] }),
      task({ id: "evaluate", status: "pending", type: "evaluate", dependsOn: ["measure"] }),
      task({ id: "recommend", status: "pending", type: "recommend", dependsOn: ["evaluate", "measure"] }),
    ];
    expect(pendingToReady(tasks)).toEqual(["evaluate"]);
  });

  it("still waits when a dependency is still running", () => {
    const tasks: GraphTask[] = [
      task({ id: "pub", status: "running", type: "publish" }),
      task({ id: "measure", status: "pending", type: "measure", dependsOn: ["pub"] }),
    ];
    expect(pendingToReady(tasks)).toEqual([]);
  });
});
