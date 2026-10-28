import { describe, expect, it } from "vitest";
import {
  AGENT_ROLES,
  attributionCoverage,
  computeAgentTeam,
  computeDataFlow,
  computeLoopSetup,
  resolveActivityEvidence,
  timeAgo,
  type AgentTaskLite,
} from "@/lib/growth-loop";

describe("computeLoopSetup", () => {
  it("reports all five slots as needs_setup on an empty workspace", () => {
    const setup = computeLoopSetup({
      profileName: null,
      contextFacts: 0,
      publishingConnections: 0,
      trackedLinks: 0,
      experiments: 0,
    });
    expect(setup.total).toBe(5);
    expect(setup.connected).toBe(0);
    expect(setup.slots.every((s) => s.status === "needs_setup")).toBe(true);
  });

  it("marks each slot connected exactly when its recorded input exists", () => {
    const setup = computeLoopSetup({
      profileName: "Acme",
      contextFacts: 4,
      publishingConnections: 0,
      trackedLinks: 2,
      experiments: 1,
    });
    expect(setup.connected).toBe(4);
    const byKey = Object.fromEntries(setup.slots.map((s) => [s.key, s.status]));
    expect(byKey).toEqual({
      profile: "connected",
      context: "connected",
      publishing: "needs_setup",
      tracking: "connected",
      experiments: "connected",
    });
  });

  it("keeps the canonical slot order", () => {
    const setup = computeLoopSetup({
      profileName: "x", contextFacts: 0, publishingConnections: 0, trackedLinks: 0, experiments: 0,
    });
    expect(setup.slots.map((s) => s.key)).toEqual(["profile", "context", "publishing", "tracking", "experiments"]);
  });

  it("mentions manual recording as the honest fallback for publishing", () => {
    const setup = computeLoopSetup({
      profileName: "x", contextFacts: 0, publishingConnections: 0, trackedLinks: 0, experiments: 0,
    });
    expect(setup.slots.find((s) => s.key === "publishing")?.detail).toMatch(/manual/i);
  });
});

describe("computeDataFlow", () => {
  it("marks every step not_started when nothing is recorded", () => {
    const steps = computeDataFlow({
      approvedCount: 0, publishedCount: 0, visitCount: 0, attributedSignups: 0, activatedCount: 0, concludedExperiments: 0,
    });
    expect(steps.every((s) => s.health === "not_started")).toBe(true);
  });

  it("marks a downstream zero as stalled only when upstream has activity", () => {
    const steps = computeDataFlow({
      approvedCount: 2, publishedCount: 1, visitCount: 0, attributedSignups: 0, activatedCount: 0, concludedExperiments: 0,
    });
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.health]));
    expect(byKey.approved).toBe("flowing");
    expect(byKey.published).toBe("flowing");
    // visits have upstream (published) but zero events → a real break
    expect(byKey.visit).toBe("stalled");
    expect(byKey.signup).toBe("stalled");
  });

  it("keeps a zero step not_started when no upstream activity exists", () => {
    const steps = computeDataFlow({
      approvedCount: 0, publishedCount: 0, visitCount: 5, attributedSignups: 0, activatedCount: 0, concludedExperiments: 0,
    });
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.health]));
    expect(byKey.approved).toBe("not_started");
    expect(byKey.visit).toBe("flowing");
  });

  it("ends the loop at experiment learning when conclusions are drafted", () => {
    const steps = computeDataFlow({
      approvedCount: 1, publishedCount: 1, visitCount: 9, attributedSignups: 2, activatedCount: 1, concludedExperiments: 1,
    });
    expect(steps.every((s) => s.health === "flowing")).toBe(true);
    expect(steps[steps.length - 1].key).toBe("learning");
  });
});

describe("attributionCoverage", () => {
  it("returns null when there are no signups — unknown, not zero", () => {
    expect(attributionCoverage(0, 0)).toBeNull();
  });

  it("computes the honest percentage", () => {
    expect(attributionCoverage(14, 10)).toBe(71);
    expect(attributionCoverage(4, 4)).toBe(100);
    expect(attributionCoverage(3, 0)).toBe(0);
  });

  it("clamps an impossible attributed count instead of exceeding 100", () => {
    expect(attributionCoverage(2, 5)).toBe(100);
  });
});

describe("resolveActivityEvidence", () => {
  it("returns null for empty or malformed meta", () => {
    expect(resolveActivityEvidence("{}")).toBeNull();
    expect(resolveActivityEvidence("not json")).toBeNull();
    expect(resolveActivityEvidence("[1,2]")).toBeNull();
  });

  it("resolves the most specific surface by priority", () => {
    expect(resolveActivityEvidence(JSON.stringify({ contentItemId: "c1", campaignId: "k1" }))).toEqual({
      href: "/app/content/c1",
      label: "View content",
    });
    expect(resolveActivityEvidence(JSON.stringify({ campaignId: "k1", goalId: "g1" }))).toEqual({
      href: "/app/campaigns/k1",
      label: "View campaign",
    });
    expect(resolveActivityEvidence(JSON.stringify({ taskId: "t1" }))).toEqual({
      href: "/app/approvals",
      label: "View task",
    });
  });

  it("ignores empty-string values and unknown keys", () => {
    expect(resolveActivityEvidence(JSON.stringify({ contentItemId: "", bogus: "x" }))).toBeNull();
    expect(resolveActivityEvidence(JSON.stringify({ contentItemId: 42 }))).toBeNull();
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  it("renders the recorded intervals", () => {
    expect(timeAgo(new Date(now.getTime() - 10_000), now)).toBe("just now");
    expect(timeAgo(new Date(now.getTime() - 5 * 60_000), now)).toBe("5 min ago");
    expect(timeAgo(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("3 h ago");
    expect(timeAgo(new Date(now.getTime() - 2 * 86_400_000), now)).toBe("2 d ago");
  });
});

describe("computeAgentTeam", () => {
  const base: Omit<AgentTaskLite, "agentRole" | "status" | "title" | "updatedAt"> = { goalId: null };
  const t = (over: Partial<AgentTaskLite>): AgentTaskLite => ({
    agentRole: "analyst",
    status: "completed",
    title: "task",
    goalId: null,
    updatedAt: new Date("2026-10-28T10:00:00Z"),
    ...over,
  });

  it("lists all six roles and marks never-run roles offline", () => {
    const team = computeAgentTeam([]);
    expect(team).toHaveLength(6);
    expect(team.map((e) => e.role)).toEqual([...AGENT_ROLES]);
    expect(team.every((e) => e.status === "offline" && e.latestAction === null)).toBe(true);
  });

  it("prioritizes blocked over awaiting over working over queued/idle", () => {
    const team = computeAgentTeam([
      t({ agentRole: "creator", status: "ready", title: "Drafting post" }),
      t({ agentRole: "publisher", status: "waiting_approval", title: "Approval gate" }),
      t({ agentRole: "analyst", status: "blocked", title: "Measure blocked" }),
      t({ agentRole: "planner", status: "completed", title: "Plan drafted" }),
      t({ agentRole: "researcher", status: "pending", title: "Collect discussions" }),
    ]);
    expect(team.map((e) => e.role)).toEqual(["analyst", "publisher", "creator", "researcher", "planner", "strategist"]);
    expect(team.find((e) => e.role === "analyst")?.status).toBe("blocked");
    expect(team.find((e) => e.role === "publisher")?.status).toBe("awaiting");
    expect(team.find((e) => e.role === "creator")?.status).toBe("working");
    expect(team.find((e) => e.role === "researcher")?.status).toBe("queued");
    expect(team.find((e) => e.role === "planner")?.status).toBe("idle");
  });

  it("surfaces the latest task title verbatim and deep-links to its goal", () => {
    const team = computeAgentTeam([
      t({ agentRole: "strategist", status: "completed", title: "Prepared landing page message test (v3)", goalId: "goal-1" }),
    ]);
    const strategist = team.find((e) => e.role === "strategist");
    expect(strategist?.latestAction).toBe("Prepared landing page message test (v3)");
    expect(strategist?.href).toBe("/app/goals/goal-1");
  });

  it("ignores unknown roles instead of fabricating entries", () => {
    const team = computeAgentTeam([t({ agentRole: "wizard" })]);
    expect(team.every((e) => e.status === "offline")).toBe(true);
  });
});
