import { describe, it, expect } from "vitest";
import { cycleHasEnded, decideContinuous, MAX_INCIDENTS_PER_CYCLE, type ContinuousInput } from "@/lib/autonomy/continuous";
import { DEFAULT_POLICY, describePolicy, parsePolicy, type AutonomyPolicy } from "@/lib/autonomy/policy";

const now = new Date("2026-11-20T10:00:00Z");
const day = 86_400_000;
const policy: AutonomyPolicy = {
  ...DEFAULT_POLICY,
  level: "supervised",
  channels: ["linkedin"],
  setById: "u1",
  version: 3,
  continuous: { cycleBudget: 10, maxUnattended: 3 },
};
const rec = (id: string, confidence: string, status = "open", ageDays = 1) => ({ id, confidence, status, createdAt: new Date(now.getTime() - ageDays * day) });
const base: ContinuousInput = {
  now,
  policy,
  agentsPaused: false,
  latest: { goal: { id: "g1", status: "active", deadline: new Date(now.getTime() - day), createdAt: new Date(now.getTime() - 15 * day) }, recommendations: [rec("r1", "medium")] },
  otherOpenCycles: 0,
  unattendedStreak: 0,
  incidents: 0,
  stoppedSpotChecks: 0,
  creditsAvailable: 50,
};
const decide = (over: Partial<ContinuousInput>) => decideContinuous({ ...base, ...over });

describe("continuous cycles (R5)", () => {
  it("starts the next cycle from a confident recommendation once the cycle has ended, with the policy's budget", () => {
    expect(decide({})).toEqual({ start: true, recommendationId: "r1", budget: 10 });
  });

  it("is off unless a person turned it on under a supervised policy", () => {
    expect(decide({ policy: { ...policy, continuous: null } })).toMatchObject({ start: false, tell: false });
    expect(decide({ policy: { ...policy, level: "approve_each" } })).toMatchObject({ start: false, tell: false });
    expect(decide({ policy: { ...policy, setById: null } })).toMatchObject({ start: false, tell: false });
  });

  it("does nothing while agents are paused: one action stops everything", () => {
    expect(decide({ agentsPaused: true })).toMatchObject({ start: false, reason: "Agents are paused." });
  });

  it("waits for the cycle to end and for its report", () => {
    const running = { ...base.latest!, goal: { ...base.latest!.goal, deadline: new Date(now.getTime() + day) } };
    expect(decide({ latest: running })).toMatchObject({ start: false, tell: false });
    expect(decide({ latest: { ...base.latest!, recommendations: [] } })).toMatchObject({ start: false, tell: false });
  });

  it("starts at most one next cycle: an acted-on recommendation or another open cycle means wait", () => {
    expect(decide({ latest: { ...base.latest!, recommendations: [rec("r1", "high", "acted_upon"), rec("r2", "high")] } })).toMatchObject({ start: false, tell: false });
    expect(decide({ otherOpenCycles: 1 })).toMatchObject({ start: false, tell: false });
  });

  it("stops and tells the founder after the most unattended cycles in a row the policy allows", () => {
    expect(decide({ unattendedStreak: 2 })).toMatchObject({ start: true });
    const d = decide({ unattendedStreak: 3 });
    expect(d).toMatchObject({ start: false, tell: true });
    expect(!d.start && d.reason).toMatch(/3 cycles in a row/);
  });

  it("stops for incident review and for a spot check the founder stopped", () => {
    expect(decide({ incidents: MAX_INCIDENTS_PER_CYCLE })).toMatchObject({ start: true });
    expect(decide({ incidents: MAX_INCIDENTS_PER_CYCLE + 1 })).toMatchObject({ start: false, tell: true });
    expect(decide({ stoppedSpotChecks: 1 })).toMatchObject({ start: false, tell: true });
  });

  it("leaves low-confidence recommendations to the founder, and prefers the most confident, then the oldest", () => {
    expect(decide({ latest: { ...base.latest!, recommendations: [rec("r1", "low")] } })).toMatchObject({ start: false, tell: true });
    const pick = decide({ latest: { ...base.latest!, recommendations: [rec("m-old", "medium", "open", 3), rec("h-new", "high", "open", 1), rec("h-old", "high", "accepted", 2)] } });
    expect(pick).toMatchObject({ start: true, recommendationId: "h-old" });
  });

  it("does not start a cycle the balance cannot fund", () => {
    expect(decide({ creditsAvailable: 9 })).toMatchObject({ start: false, tell: true });
    expect(decide({ creditsAvailable: 10 })).toMatchObject({ start: true });
  });

  it("a cycle ends at its deadline or when it is achieved or missed, never while planning", () => {
    const g = base.latest!.goal;
    expect(cycleHasEnded({ ...g, status: "achieved", deadline: null }, now)).toBe(true);
    expect(cycleHasEnded({ ...g, status: "active", deadline: null }, now)).toBe(false);
    expect(cycleHasEnded({ ...g, status: "planning" }, now)).toBe(false);
  });

  it("older stored policies parse with continuous cycles off, and the summary says when they are on", () => {
    const old = parsePolicy(JSON.stringify({ level: "supervised", channels: ["x"], maxPerDay: 2, quietHours: null, blackoutDates: [], autoPublish: false, version: 2, setById: "u" }));
    expect(old.continuous).toBeNull();
    expect(describePolicy(old)).not.toMatch(/next one itself/);
    expect(describePolicy(policy)).toMatch(/starts the next one itself \(up to 3 in a row, 10 credits each\)/);
  });
});
