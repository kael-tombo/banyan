import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A slow task keeps its lease, and a late result cannot overwrite what happened
 * meanwhile: a founder's cancel, or another worker taking the task over.
 */

type Row = { id: string; status: string; attempts: number; leasedUntil: Date | null; output?: string; lastError?: string | null };

const mocks = vi.hoisted(() => ({
  task: {} as { current: unknown },
  run: { current: null as Record<string, unknown> | null },
  handler: vi.fn(),
}));

const row = () => mocks.task.current as Row;

vi.mock("@/lib/db", () => ({
  prisma: {
    agentTask: {
      // Applies the where clause for real, since that is the behaviour under test.
      updateMany: vi.fn(async ({ where, data }: { where: Partial<Row>; data: Record<string, unknown> }) => {
        const r = row();
        const matches = (!where.status || r.status === where.status) && (where.attempts === undefined || r.attempts === where.attempts);
        if (!matches) return { count: 0 };
        const { attempts, ...rest } = data;
        Object.assign(r, rest);
        if (attempts && typeof attempts === "object") r.attempts += (attempts as { increment: number }).increment;
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(row(), data)),
    },
    taskRun: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mocks.run.current = { id: "run_1", ...data };
        return mocks.run.current;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(mocks.run.current!, data)),
    },
  },
}));
vi.mock("@/lib/activity", () => ({ recordActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/agents/handlers", () => ({ HANDLERS: { research: mocks.handler } }));
vi.mock("@/lib/agents/verify", () => ({ verifyOutput: () => ({ ok: true }) }));
vi.mock("@/lib/agents/workflow-template", () => ({ initialDistributionTasks: () => [] }));

import { prisma } from "@/lib/db";
import { executeTask } from "@/lib/agents/orchestrator";
import type { TaskEnvelope } from "@/lib/agents/types";

const envelope = () => ({ id: "t1", workspaceId: "ws", goalId: null, type: "research", title: "Research", attempts: 0, maxAttempts: 3, startedAt: null, verification: {} }) as unknown as TaskEnvelope;

/** A handler that waits until the test lets it finish. */
function slowHandler(result: unknown) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  mocks.handler.mockImplementation(async () => {
    await gate;
    return result;
  });
  return release;
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const COMPLETED = { outcome: "completed", output: { summary: "done" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.task.current = { id: "t1", status: "ready", attempts: 0, leasedUntil: null } satisfies Row;
  mocks.run.current = null;
});

describe("executeTask", () => {
  it("finishes normally when nothing interfered", async () => {
    mocks.handler.mockResolvedValue(COMPLETED);
    expect(await executeTask(envelope(), null)).toBe("completed");
    expect(row().status).toBe("completed");
    expect(row().leasedUntil).toBeNull();
    expect(mocks.run.current?.status).toBe("completed");
  });

  it("does not overwrite a founder's cancel with a late result", async () => {
    const release = slowHandler(COMPLETED);
    const running = executeTask(envelope(), null);
    await flush();
    expect(row().status).toBe("running");

    row().status = "cancelled"; // the founder cancels while it runs
    release();

    expect(await running).toBeNull();
    expect(row().status).toBe("cancelled");
    expect(row().output).toBeUndefined();
    expect(mocks.run.current?.status).toBe("superseded");
  });

  it("drops a stale worker's result once another attempt owns the task", async () => {
    const release = slowHandler(COMPLETED);
    const running = executeTask(envelope(), null);
    await flush();

    row().attempts = 2; // the lease expired and another worker claimed it
    release();

    expect(await running).toBeNull();
    expect(row().status).toBe("running");
    expect(row().output).toBeUndefined();
  });

  it("drops a stale failure as well, so it cannot requeue a task that moved on", async () => {
    const release = slowHandler({ outcome: "failed", error: "boom", retryable: true });
    const running = executeTask(envelope(), null);
    await flush();
    row().status = "cancelled";
    release();
    expect(await running).toBeNull();
    expect(row().status).toBe("cancelled");
  });

  it.each([
    ["waiting_approval", { outcome: "waiting_approval", note: "needs a person" }],
    ["blocked", { outcome: "blocked", reason: "no connection", actionable: "connect it" }],
  ])("fences a %s outcome too", async (_name, result) => {
    const release = slowHandler(result);
    const running = executeTask(envelope(), null);
    await flush();
    row().status = "cancelled";
    release();
    expect(await running).toBeNull();
    expect(row().status).toBe("cancelled");
  });

  it("renews the lease while a slow handler works, and stops afterwards", async () => {
    vi.useFakeTimers();
    try {
      const release = slowHandler(COMPLETED);
      const running = executeTask(envelope(), null);
      await vi.advanceTimersByTimeAsync(0);
      const first = row().leasedUntil!.getTime();

      await vi.advanceTimersByTimeAsync(4 * 60_000);
      expect(row().leasedUntil!.getTime()).toBeGreaterThan(first);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      // Fourteen minutes in, well past the original five-minute lease, and it is still held.
      expect(row().leasedUntil!.getTime()).toBeGreaterThan(Date.now());

      release();
      await vi.advanceTimersByTimeAsync(0);
      await running;
      const writes = vi.mocked(prisma.agentTask.updateMany).mock.calls.length;
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(vi.mocked(prisma.agentTask.updateMany).mock.calls.length).toBe(writes);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not renew a lease it has lost", async () => {
    vi.useFakeTimers();
    try {
      const release = slowHandler(COMPLETED);
      const running = executeTask(envelope(), null);
      await vi.advanceTimersByTimeAsync(0);
      row().status = "cancelled";
      const held = row().leasedUntil;
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(row().leasedUntil).toBe(held);
      release();
      await vi.advanceTimersByTimeAsync(0);
      await running;
    } finally {
      vi.useRealTimers();
    }
  });
});
