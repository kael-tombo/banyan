import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/** R4: the planner may ask the founder one question, and the answer continues the same session. */

const runs = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], next: null as unknown }));
vi.mock("@/lib/agents/runtime/opencode/agent-task", () => ({
  runAgentTask: vi.fn(async (args: Record<string, unknown>) => {
    runs.calls.push(args);
    return runs.next;
  }),
  modelsOf: () => "anthropic/claude-sonnet-5-5",
}));
vi.mock("@/lib/model/router", () => ({ checkRunQuota: vi.fn(async () => ({ allowed: true, reason: null, remaining: 5 })) }));

import { planWithAgent } from "@/lib/agents/runtime/opencode/planner";
import { openQuestion } from "@/lib/agents/questions";

const schema = z.object({ summary: z.string(), assumptions: z.array(z.string()), missingInfo: z.array(z.string()), risks: z.array(z.string()), phases: z.array(z.object({ name: z.string() })) });
const plan = { summary: "Launch on LinkedIn first.", assumptions: ["a"], missingInfo: [], risks: ["r"], phases: [{ name: "Research" }] };
const result = (over: Record<string, unknown> = {}) => ({ status: "completed", stopped: null, question: null, summary: JSON.stringify(plan), ...over });
const base = { workspaceId: "ws_1", taskId: "task_1", attempt: 1, goalAndContext: "Goal: get 20 signups", schema };

beforeEach(() => {
  runs.calls = [];
  runs.next = null;
});

describe("planWithAgent", () => {
  it("returns the plan when the planner did not need to ask", async () => {
    runs.next = result();
    expect(await planWithAgent(base)).toMatchObject({ ok: true, data: plan });
  });

  it("returns the question and the run to continue when the planner asked", async () => {
    runs.next = result({ question: "Which market comes first?", summary: "Waiting for the founder." });
    expect(await planWithAgent(base)).toEqual({ ok: "asked", question: "Which market comes first?", runId: "attempt-1" });
  });

  it("continues the asking run's session with the answer, even on a later attempt, and allows no second question", async () => {
    runs.next = result();
    const r = await planWithAgent({ ...base, attempt: 3, previous: { runId: "attempt-1", question: "Which market?", answer: "B2B." } });
    expect(r.ok).toBe(true);
    expect(runs.calls[0]).toMatchObject({ runId: "attempt-1", context: { asked: "1" } });
    expect(String(runs.calls[0]!.followUp)).toMatch(/B2B\./);
  });

  it("ignores a second question after an answer, falling back rather than blocking again", async () => {
    runs.next = result({ question: "And the price?", summary: "Waiting for the founder." });
    const r = await planWithAgent({ ...base, previous: { runId: "attempt-1", question: "Which market?", answer: "B2B." } });
    expect(r).toMatchObject({ ok: false, stopped: false });
  });

  it("says it was stopped at its limit, so the handler uses the template", async () => {
    runs.next = result({ status: "budget_exhausted", stopped: "budget", summary: "" });
    expect(await planWithAgent(base)).toMatchObject({ ok: false, stopped: true });
  });
});

describe("openQuestion", () => {
  it("finds an unanswered question on a blocked task, and nothing once answered", () => {
    const asked = JSON.stringify({ summary: "s", data: { question: "Which market?", runId: "attempt-1" } });
    expect(openQuestion(asked)).toMatchObject({ question: "Which market?", runId: "attempt-1" });
    expect(openQuestion(JSON.stringify({ data: { question: "Q", runId: "r", answer: "A" } }))).toBeNull();
    expect(openQuestion(null)).toBeNull();
    expect(openQuestion("not json")).toBeNull();
  });
});
