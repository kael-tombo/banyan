import { describe, expect, it } from "vitest";
import {
  canTransitionGoal,
  canTransitionTask,
  GOAL_TRANSITIONS,
  TASK_TYPES,
  TASK_ROLE,
  isTaskType,
} from "@/lib/state-machines";
import { canApprove, canControlWorkflow, canRead, canWrite, requireRole } from "@/lib/permissions";
import { initialDistributionTasks, contentSpecsForChannels } from "@/lib/agents/workflow-template";

describe("goal state machine", () => {
  it("moves draft → planning → awaiting_approval → active", () => {
    expect(canTransitionGoal("draft", "planning")).toBe(true);
    expect(canTransitionGoal("planning", "awaiting_approval")).toBe(true);
    expect(canTransitionGoal("awaiting_approval", "active")).toBe(true);
  });

  it("forbids skipping the approval gate", () => {
    expect(canTransitionGoal("draft", "active")).toBe(false);
    expect(canTransitionGoal("planning", "active")).toBe(false);
  });

  it("allows regenerating a plan from awaiting_approval", () => {
    expect(canTransitionGoal("awaiting_approval", "planning")).toBe(true);
  });

  it("supports pause/resume and terminal endings", () => {
    expect(canTransitionGoal("active", "paused")).toBe(true);
    expect(canTransitionGoal("paused", "active")).toBe(true);
    expect(canTransitionGoal("active", "achieved")).toBe(true);
    expect(canTransitionGoal("achieved", "active")).toBe(false);
    expect(canTransitionGoal("cancelled", "active")).toBe(false);
  });

  it("every status has a transition map entry", () => {
    for (const s of ["draft", "planning", "awaiting_approval", "active", "paused", "achieved", "missed", "cancelled"]) {
      expect(Array.isArray(GOAL_TRANSITIONS[s as keyof typeof GOAL_TRANSITIONS])).toBe(true);
    }
  });
});

describe("task state machine", () => {
  it("follows pending → ready → running → completed", () => {
    expect(canTransitionTask("pending", "ready")).toBe(true);
    expect(canTransitionTask("ready", "running")).toBe(true);
    expect(canTransitionTask("running", "completed")).toBe(true);
  });

  it("supports the approval path: running → waiting_approval → completed", () => {
    expect(canTransitionTask("running", "waiting_approval")).toBe(true);
    expect(canTransitionTask("waiting_approval", "completed")).toBe(true);
    expect(canTransitionTask("waiting_approval", "blocked")).toBe(true);
  });

  it("supports crash recovery: running → ready (lease expired)", () => {
    expect(canTransitionTask("running", "ready")).toBe(true);
  });

  it("supports bounded retry: failed → ready, blocked → ready", () => {
    expect(canTransitionTask("failed", "ready")).toBe(true);
    expect(canTransitionTask("blocked", "ready")).toBe(true);
  });

  it("completed is terminal", () => {
    expect(canTransitionTask("completed", "ready")).toBe(false);
    expect(canTransitionTask("completed", "running")).toBe(false);
    expect(canTransitionTask("completed", "failed")).toBe(false);
  });

  it("no-op transitions are allowed", () => {
    expect(canTransitionTask("ready", "ready")).toBe(true);
    expect(canTransitionGoal("active", "active")).toBe(true);
  });
});

describe("task vocabulary", () => {
  it("maps every task type to an agent role", () => {
    for (const t of TASK_TYPES) {
      expect(TASK_ROLE[t]).toBeTruthy();
    }
  });

  it("recognizes valid task types and rejects unknown ones", () => {
    expect(isTaskType("publish")).toBe(true);
    expect(isTaskType("pay_bill")).toBe(false);
  });
});

describe("backend permissions", () => {
  it("grants read to every role", () => {
    expect(canRead("owner")).toBe(true);
    expect(canRead("member")).toBe(true);
    expect(canRead("viewer")).toBe(true);
    expect(canRead("unknown")).toBe(false);
  });

  it("grants write only to owner and member", () => {
    expect(canWrite("owner")).toBe(true);
    expect(canWrite("member")).toBe(true);
    expect(canWrite("viewer")).toBe(false);
  });

  it("restricts approvals and workflow control to write roles", () => {
    expect(canApprove("viewer")).toBe(false);
    expect(canApprove("member")).toBe(true);
    expect(canControlWorkflow("viewer")).toBe(false);
    expect(canControlWorkflow("owner")).toBe(true);
  });

  it("requireRole returns an error string for insufficient roles and null otherwise", () => {
    expect(requireRole("viewer", "write")).toMatch(/does not grant/);
    expect(requireRole("owner", "write")).toBeNull();
    expect(requireRole("viewer", "read")).toBeNull();
    expect(requireRole("viewer", "approve")).toMatch(/owners and members/);
  });
});

describe("workflow template integrity", () => {
  it("starts with plan_draft ready and the rest pending", () => {
    const specs = initialDistributionTasks("goal-1");
    expect(specs).toHaveLength(4);
    expect(specs[0].type).toBe("plan_draft");
    expect(specs[0].status).toBe("ready");
    expect(specs[0].requiresApproval).toBe(true);
    expect(specs.filter((s) => s.status === "pending")).toHaveLength(3);
  });

  it("chains plan → research → strategy → campaign_plan by dedupe key", () => {
    const specs = initialDistributionTasks("goal-1");
    expect(specs[1].dependsOn).toEqual([specs[0].dedupeKey]);
    expect(specs[2].dependsOn).toEqual([specs[1].dedupeKey]);
    expect(specs[3].dependsOn).toEqual([specs[2].dedupeKey]);
  });

  it("produces stable, unique dedupe keys (idempotent re-runs)", () => {
    const a = initialDistributionTasks("goal-1");
    const b = initialDistributionTasks("goal-1");
    expect(a.map((s) => s.dedupeKey)).toEqual(b.map((s) => s.dedupeKey));
    expect(new Set(a.map((s) => s.dedupeKey)).size).toBe(a.length);
  });

  it("downstream specs carry the approval gate before publish, and analysis after", () => {
    const specs = contentSpecsForChannels("goal-1", "camp-1", [
      { channel: "x", format: "single" },
      { channel: "linkedin", format: "insight" },
    ]);
    const bySlot = (needle: string) => specs.find((s) => s.dedupeKey.includes(needle))!;
    const gate = bySlot("approval_gate");
    const publish = bySlot(":publish");
    const measure = bySlot("measure");
    const evaluate = bySlot("evaluate");
    const recommend = bySlot("recommend");

    expect(gate.requiresApproval).toBe(true);
    expect(gate.dependsOn).toHaveLength(2); // both content drafts
    expect(publish.dependsOn).toEqual([gate.dedupeKey]);
    expect(measure.dependsOn).toEqual([publish.dedupeKey]);
    expect(evaluate.dependsOn).toEqual([measure.dedupeKey]);
    // The recommendation reads BOTH evaluation and measurement outputs.
    expect(recommend.dependsOn).toEqual([evaluate.dedupeKey, measure.dedupeKey]);
  });

  it("does not create content tasks for channels with no drafts", () => {
    const specs = contentSpecsForChannels("goal-1", "camp-1", []);
    expect(specs.some((s) => s.type === "content_draft")).toBe(false);
    expect(specs.find((s) => s.type === "approval_gate")).toBeTruthy();
  });
});
