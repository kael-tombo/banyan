import { describe, expect, it, vi } from "vitest";
import { OpenCodeAgentRuntime, sessionIdFor, taskForSession, type OpenCodeHost, type V2Message, type V2Session } from "@/lib/agents/runtime/opencode/runtime";
import type { AgentTaskSpec } from "@/lib/agents/runtime/types";

/**
 * The embedded OpenCode runtime against a stand-in host. The real host's behaviour (hard step
 * limits, idempotent session ids, resume after a crash, message shapes) is pinned by the probes
 * in central-brain-agent-platform's scripts/conformance-v2, against @opencode/sdk 2.2.6.
 */

const spec = (over: Partial<AgentTaskSpec> = {}): AgentTaskSpec => ({
  workspaceId: "ws_1",
  taskId: "task_1",
  runId: "attempt-1",
  agent: "researcher",
  brief: "Research this.",
  budget: { maxSteps: 10, maxTokens: 10_000 },
  ...over,
});

const assistant = (over: Partial<V2Message> = {}): V2Message => ({
  id: `msg_${Math.random()}`,
  type: "assistant",
  model: { providerID: "anthropic", id: "claude-haiku-5-5" },
  tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 50, write: 0 } },
  cost: 0.002,
  content: [{ type: "text", text: '{"ok":true}' }],
  ...over,
});

function fakeHost(script: { messages?: V2Message[]; existing?: V2Message[]; waitForever?: boolean; sessionTokens?: number }) {
  let stored: V2Message[] = script.existing ?? [];
  const calls = { create: [] as unknown[], prompt: [] as unknown[], interrupt: 0 };
  let release: () => void = () => {};
  const host: OpenCodeHost = {
    sessions: {
      create: vi.fn(async (input) => {
        calls.create.push(input);
        return { id: input.id } as V2Session;
      }),
      get: vi.fn(async ({ sessionID }) => ({ id: sessionID, tokens: { input: script.sessionTokens ?? 0 } })),
      prompt: vi.fn(async (input) => {
        calls.prompt.push(input);
        stored = [{ id: "msg_user", type: "user", text: input.text }, ...(script.messages ?? [])];
      }),
      interrupt: vi.fn(async () => {
        calls.interrupt++;
        release();
      }),
    },
    message: { list: vi.fn(async () => ({ data: stored })) },
    experimental: {
      session: {
        wait: vi.fn(() => (script.waitForever ? new Promise<void>((r) => (release = r)) : Promise.resolve())),
      },
    },
  };
  return { host, calls };
}

const runtime = (host: OpenCodeHost, over: Partial<ConstructorParameters<typeof OpenCodeAgentRuntime>[0]> = {}) =>
  new OpenCodeAgentRuntime({ host: async () => host, sandbox: "/tmp/sandbox", replica: "worker-a", timeoutMs: 60_000, pollMs: 5, ...over });

describe("OpenCodeAgentRuntime", () => {
  it("runs one session per attempt, with the task's workspace in its metadata, and sums usage per model", async () => {
    const { host, calls } = fakeHost({
      messages: [
        assistant({ content: [{ type: "tool", name: "banyan_record_note", state: { status: "completed", content: [{ type: "text", text: '{"id":"fact_1","key":"k"}' }] } }] }),
        assistant({ model: { providerID: "openai", id: "gpt-5.5" }, cost: 0.003 }),
        { id: "msg_idle", type: "idle", outcome: "succeeded" },
      ],
    });
    const r = await runtime(host).run(spec());
    expect(calls.create[0]).toMatchObject({ id: sessionIdFor(spec()), agent: "researcher", metadata: { workspaceId: "ws_1", taskId: "task_1" }, location: { directory: "/tmp/sandbox" } });
    expect(calls.prompt).toEqual([{ sessionID: sessionIdFor(spec()), text: "Research this." }]);
    expect(r.status).toBe("completed");
    expect(r.summary).toBe('{"ok":true}');
    expect(r.proposals).toEqual([{ kind: "note", id: "fact_1" }]);
    expect(r.perModel).toEqual([
      { model: "anthropic/claude-haiku-5-5", inputTokens: 150, outputTokens: 25 },
      { model: "openai/gpt-5.5", inputTokens: 150, outputTokens: 25 },
    ]);
    expect(r.usage).toMatchObject({ steps: 2, toolCalls: 1, inputTokens: 300, outputTokens: 50 });
    expect(r.costUsd).toBeCloseTo(0.005);
    expect(r.sessionRef).toBe(`worker-a:${sessionIdFor(spec())}`);
  });

  it("reattaches to a resumed attempt without sending the prompt again, so the work is not asked for twice", async () => {
    const { host, calls } = fakeHost({ existing: [{ id: "msg_user", type: "user", text: "Research this." }, assistant(), { id: "i", type: "idle", outcome: "succeeded" }] });
    const r = await runtime(host).resume(spec());
    expect(calls.prompt).toHaveLength(0);
    expect(r.status).toBe("completed");
  });

  it("after a restart, keeps waiting until the host has resumed the session and it ended, not just until it is idle", async () => {
    const unfinished: V2Message[] = [{ id: "msg_user", type: "user", text: "Research this." }, assistant({ content: [{ type: "text", text: "Work" }] })];
    const { host, calls } = fakeHost({ existing: unfinished });
    let waits = 0;
    host.experimental.session.wait = vi.fn(async () => {
      waits++;
      // The host's resume starts only after the first wait has returned.
      if (waits === 2) unfinished.push(assistant(), { id: "i", type: "idle", outcome: "succeeded" });
    });
    const r = await runtime(host).resume(spec());
    expect(calls.prompt).toHaveLength(0);
    expect(waits).toBeGreaterThanOrEqual(2);
    expect(r.status).toBe("completed");
  });

  it("keys sessions by attempt: a retry is a new session, the same attempt is the same one", () => {
    expect(sessionIdFor(spec())).toBe(sessionIdFor(spec()));
    expect(sessionIdFor(spec({ runId: "attempt-2" }))).not.toBe(sessionIdFor(spec()));
    expect(sessionIdFor(spec())).toMatch(/^ses_/);
  });

  it("interrupts a run past its token budget, because OpenCode does not enforce one", async () => {
    const { host, calls } = fakeHost({ waitForever: true, sessionTokens: 50_000, messages: [assistant()] });
    const r = await runtime(host).run(spec());
    expect(calls.interrupt).toBe(1);
    expect(r.status).toBe("budget_exhausted");
  });

  it("interrupts a run past its deadline and reports it as failed", async () => {
    const { host, calls } = fakeHost({ waitForever: true, messages: [assistant()] });
    const r = await runtime(host, { timeoutMs: 1 }).run(spec());
    expect(calls.interrupt).toBe(1);
    expect(r.status).toBe("failed");
    expect(r.summary).toMatch(/Stopped after/);
  });

  it("reports failure when the session did not succeed, or ended without an answer", async () => {
    const failed = fakeHost({ messages: [assistant(), { id: "i", type: "idle", outcome: "failed" }] });
    expect((await runtime(failed.host).run(spec())).status).toBe("failed");
    const empty = fakeHost({ messages: [assistant({ content: [] }), { id: "i", type: "idle", outcome: "succeeded" }] });
    expect((await runtime(empty.host).run(spec())).status).toBe("failed");
  });

  it("knows which task a session serves only while it runs", async () => {
    let seen: unknown;
    const { host } = fakeHost({ messages: [assistant(), { id: "i", type: "idle", outcome: "succeeded" }] });
    host.experimental.session.wait = vi.fn(async () => {
      seen = taskForSession(sessionIdFor(spec()));
    });
    await runtime(host).run(spec());
    expect(seen).toEqual({ workspaceId: "ws_1", taskId: "task_1" });
    expect(taskForSession(sessionIdFor(spec()))).toBeUndefined();
  });
});
