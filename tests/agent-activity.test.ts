import { describe, it, expect } from "vitest";
import { activityRows, filterActivityRows, approvalQueueItems, pauseSummary, ACTIVITY_STATUSES } from "@/lib/agent-activity";

const task = (over: Partial<Parameters<typeof activityRows>[0][number]> = {}) => ({
  id: "t1",
  agentRole: "creator",
  status: "completed",
  title: "Draft short-video hook",
  expectedOutput: null,
  goalId: "g1",
  campaignId: null,
  requiresApproval: false,
  updatedAt: new Date("2026-10-29T10:00:00Z"),
  attempts: 1,
  ...over,
});

describe("activityRows", () => {
  it("maps roles to agent names and sorts newest first", () => {
    const rows = activityRows([
      task({ id: "old", updatedAt: new Date("2026-10-28T09:00:00Z") }),
      task({ id: "new", agentRole: "analyst", updatedAt: new Date("2026-10-29T11:00:00Z") }),
    ]);
    expect(rows[0].id).toBe("new");
    expect(rows[0].agentName).toBe("Analyst Agent");
    expect(rows[1].agentName).toBe("Creator Agent");
  });

  it("summarizes string expected output and truncates long objects", () => {
    const rows = activityRows([
      task({ expectedOutput: "A 3-scene script" }),
      task({ id: "t2", expectedOutput: { format: "hook_script", scenes: 3, extra: "x", more: "y" } }),
    ]);
    expect(rows[0].detail).toBe("A 3-scene script");
    expect(rows[1].detail).toContain("format: hook_script");
    expect(rows[1].detail).toContain("+1 more");
  });

  it("falls back to the raw role for unknown roles", () => {
    const rows = activityRows([task({ agentRole: "mystery" })]);
    expect(rows[0].agentName).toBe("mystery");
  });
});

describe("filterActivityRows", () => {
  const rows = activityRows([
    task({ id: "a", agentRole: "creator", status: "completed", updatedAt: new Date("2026-10-29T10:00:00Z") }),
    task({ id: "b", agentRole: "analyst", status: "failed", updatedAt: new Date("2026-10-29T09:00:00Z") }),
    task({ id: "c", agentRole: "creator", status: "failed", updatedAt: new Date("2026-10-20T09:00:00Z") }),
  ]);

  it("filters by role, status, and since independently", () => {
    const since = new Date("2026-10-29T00:00:00Z");
    expect(filterActivityRows(rows, { role: "creator" }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterActivityRows(rows, { status: "failed" }).map((r) => r.id)).toEqual(["b", "c"]);
    expect(filterActivityRows(rows, { since }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(filterActivityRows(rows, { role: "creator", status: "failed", since }).map((r) => r.id)).toEqual([]);
  });

  it("exposes the full status vocabulary the table filter offers", () => {
    expect(ACTIVITY_STATUSES).toContain("waiting_approval");
    expect(ACTIVITY_STATUSES).toContain("blocked");
  });
});

describe("approvalQueueItems", () => {
  it("collects waiting approval gates and awaiting plans", () => {
    const items = approvalQueueItems(
      [
        task({ id: "gate1", requiresApproval: true, status: "waiting_approval", title: "Review landing copy" }),
        task({ id: "done", requiresApproval: true, status: "completed" }),
        task({ id: "notgate", requiresApproval: false, status: "waiting_approval" }),
      ],
      [{ goalId: "g9", goalObjective: "Reach 100 trials", goalStatus: "awaiting_approval", summary: "Plan summary", status: "planned", updatedAt: new Date("2026-10-29T08:00:00Z") }]
    );
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(["task_gate:gate1", "goal_plan:g9"]);
    expect(items[1].agentRole).toBe("planner");
    expect(items[1].detail).toBe("Plan summary");
  });

  it("ignores plans whose goal is not awaiting approval", () => {
    const items = approvalQueueItems(
      [],
      [{ goalId: "g1", goalObjective: "G", goalStatus: "active", summary: null, status: "approved", updatedAt: new Date() }]
    );
    expect(items).toHaveLength(0);
  });
});

describe("pauseSummary", () => {
  it("reports active when never paused", () => {
    expect(pauseSummary(null)).toEqual({ paused: false, label: "Agents active" });
  });

  it("formats a human pause label", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    expect(pauseSummary(new Date(now.getTime() - 5 * 60_000), now).label).toBe("Agents paused 5 min ago");
    expect(pauseSummary(new Date(now.getTime() - 3 * 3_600_000), now).label).toBe("Agents paused 3 h ago");
  });
});
