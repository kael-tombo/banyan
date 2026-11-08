import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * R4: every agent run that stops early is an incident the founder can see, and a run stopped at
 * its limit leads to no further paid call.
 */

const state = vi.hoisted(() => ({
  activity: [] as { type: string; summary: string; meta: Record<string, unknown> }[],
  ledger: [] as { ok: boolean }[],
  next: null as unknown,
}));

vi.mock("@/lib/activity", () => ({
  recordActivity: vi.fn(async (a: { type: string; summary: string; meta: Record<string, unknown> }) => {
    state.activity.push(a);
  }),
}));
vi.mock("@/lib/model/router", () => ({
  recordAgentRun: vi.fn(async (r: { ok: boolean }) => {
    state.ledger.push(r);
    return "row";
  }),
  checkRunQuota: vi.fn(async () => ({ allowed: true, reason: null, remaining: 5 })),
}));
vi.mock("@/lib/agents/runtime/opencode/host", () => ({
  getOpenCodeRuntime: () => ({
    run: vi.fn(async () => {
      if (state.next instanceof Error) throw state.next;
      return state.next;
    }),
  }),
}));

import { runAgentTask } from "@/lib/agents/runtime/opencode/agent-task";
import { researchWithAgent } from "@/lib/agents/runtime/opencode/research";
import { z } from "zod";

const result = (over: Record<string, unknown> = {}) => ({
  status: "completed",
  stopped: null,
  tokens: 1200,
  summary: "Done.",
  perModel: [{ model: "anthropic/claude-haiku-5-5", inputTokens: 1000, outputTokens: 200 }],
  usage: { steps: 3, toolCalls: 2, inputTokens: 1000, outputTokens: 200, subagents: 0 },
  costUsd: 0,
  latencyMs: 10,
  proposals: [],
  sessionRef: "w:ses_1",
  runtime: "opencode",
  ...over,
});
const args = { workspaceId: "ws_1", taskId: "task_1", runId: "attempt-1", agent: "writer" as const, brief: "b", purpose: "content_draft", attempt: 1 };

beforeEach(() => {
  state.activity = [];
  state.ledger = [];
  state.next = null;
});

describe("the incident log", () => {
  it("records nothing for a run that completed", async () => {
    state.next = result();
    await runAgentTask(args);
    expect(state.activity).toEqual([]);
    expect(state.ledger).toEqual([expect.objectContaining({ ok: true })]);
  });

  it("records a run stopped at its token budget, with the numbers, and still writes its ledger row", async () => {
    state.next = result({ status: "budget_exhausted", stopped: "budget", tokens: 91_000 });
    await runAgentTask(args);
    expect(state.activity).toHaveLength(1);
    expect(state.activity[0]).toMatchObject({ type: "agent_incident", meta: { taskId: "task_1", purpose: "content_draft", status: "budget_exhausted" } });
    expect(state.activity[0]!.summary).toMatch(/writer agent stopped: it reached its token budget \(91,000 tokens used/);
    expect(state.activity[0]!.summary).toMatch(/Nothing more was spent/);
    expect(state.ledger).toEqual([expect.objectContaining({ ok: false })]);
  });

  it("records a run that ran out of time, and one that could not start at all", async () => {
    state.next = result({ status: "failed", stopped: "timeout", summary: "Stopped after 240s." });
    await runAgentTask(args);
    expect(state.activity[0]!.summary).toMatch(/ran out of time/);
    state.next = new Error("host failed to start");
    await expect(runAgentTask(args)).rejects.toThrow(/host failed/);
    expect(state.activity[1]!.summary).toMatch(/could not run: host failed to start/);
  });
});

describe("research stopped at its limit", () => {
  const schema = z.object({ questions: z.array(z.string()) });
  it("says it was stopped, so the handler uses the free template instead of another paid call", async () => {
    state.next = result({ status: "budget_exhausted", stopped: "budget", summary: "" });
    const r = await researchWithAgent({ workspaceId: "ws_1", taskId: "task_1", attempt: 1, context: "c", schema });
    expect(r).toMatchObject({ ok: false, stopped: true });
  });

  it("does not say stopped for an answer that was merely unusable", async () => {
    state.next = result({ summary: "not json" });
    const r = await researchWithAgent({ workspaceId: "ws_1", taskId: "task_1", attempt: 1, context: "c", schema });
    expect(r).toMatchObject({ ok: false, stopped: false });
  });
});
