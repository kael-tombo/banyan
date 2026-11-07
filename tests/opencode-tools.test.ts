import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Banyan's agent tools. OpenCode's recovery is at-least-once, so a tool may be called again
 * after a crash (conformance V07): a repeated note must change nothing.
 */

const db = vi.hoisted(() => ({
  workspace: { status: "active", agentsPausedAt: null as Date | null } as Record<string, unknown> | null,
  facts: new Map<string, { id: string; source: string }>(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: { findUnique: vi.fn(async () => db.workspace) },
    profileFact: {
      findUnique: vi.fn(async ({ where }: { where: { workspaceId_category_key: { key: string } } }) => db.facts.get(where.workspaceId_category_key.key) ?? null),
      count: vi.fn(async ({ where }: { where: { source: { endsWith: string } } }) => [...db.facts.values()].filter((f) => f.source.endsWith(where.source.endsWith)).length),
      upsert: vi.fn(async ({ create }: { create: { key: string; source: string } }) => {
        const row = { id: `fact_${db.facts.size + 1}`, source: create.source };
        db.facts.set(create.key, row);
        return row;
      }),
    },
  },
}));
vi.mock("@/lib/agents/handlers/common", () => ({ loadBusinessContext: vi.fn(async () => ({})), contextBlock: () => "Product (user-provided): Acme" }));

import { prisma } from "@/lib/db";
import { MAX_NOTES_PER_TASK, noteKey, readContext, recordNote } from "@/lib/agents/runtime/opencode/banyan-tools";
import { banyanToolDefinitions, nodeSupportsOpenCode } from "@/lib/agents/runtime/opencode/host";

beforeEach(() => {
  db.workspace = { status: "active", agentsPausedAt: null };
  db.facts.clear();
  vi.mocked(prisma.profileFact.upsert).mockClear();
});

const note = (text = "Founders of small B2B tools hear about products in niche Slack groups.") => ({ text, provenance: "hypothesis" as const });

describe("recordNote", () => {
  it("records a note with its provenance and task, and returns the same note when called again", async () => {
    const first = await recordNote("ws_1", "task_1", note());
    const again = await recordNote("ws_1", "task_1", note("  founders of small b2b tools hear about products in niche   Slack groups. "));
    expect(again).toEqual(first);
    expect(prisma.profileFact.upsert).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.profileFact.upsert).mock.calls[0]![0].create).toMatchObject({ category: "research", provenance: "hypothesis", confidence: "low", source: "task:task_1" });
  });

  it("refuses an external observation without a source, rather than storing it as fact", async () => {
    await expect(recordNote("ws_1", "task_1", { text: "Competitor X raised prices in March.", provenance: "external_observation" })).rejects.toThrow(/source/);
    const ok = await recordNote("ws_1", "task_1", { text: "Competitor X raised prices in March.", provenance: "external_observation", source: "founder's notes" });
    expect(ok.id).toBeTruthy();
  });

  it("stops at a fixed number of notes per task", async () => {
    for (let i = 0; i < MAX_NOTES_PER_TASK; i++) await recordNote("ws_1", "task_1", note(`Hypothesis number ${i} about the audience and its channels.`));
    await expect(recordNote("ws_1", "task_1", note("One more hypothesis about the audience."))).rejects.toThrow(/Finish/);
  });

  it("refuses when the founder paused the agents, or the product is archived or gone", async () => {
    db.workspace = { status: "active", agentsPausedAt: new Date() };
    await expect(recordNote("ws_1", "task_1", note())).rejects.toThrow(/paused/);
    db.workspace = { status: "archived", agentsPausedAt: null };
    await expect(readContext("ws_1")).rejects.toThrow(/archived/);
    db.workspace = null;
    await expect(readContext("ws_1")).rejects.toThrow(/no longer exists/);
  });

  it("refuses notes that are empty or too long", async () => {
    await expect(recordNote("ws_1", "task_1", note("short"))).rejects.toThrow();
    await expect(recordNote("ws_1", "task_1", note("x".repeat(601)))).rejects.toThrow(/600/);
  });

  it("keys a note by its task and normalized text", () => {
    expect(noteKey("task_1", "A  B")).toBe(noteKey("task_1", "a b"));
    expect(noteKey("task_1", "A")).not.toBe(noteKey("task_2", "A"));
  });
});

describe("tool definitions as the host registers them", () => {
  it("finds the task from the session's metadata when the host resumed it before any worker reattached", async () => {
    const host = { sessions: { get: vi.fn(async () => ({ id: "ses_x", metadata: { taskId: "task_9" } })) } };
    const tools = banyanToolDefinitions("ws_1", () => host as never);
    const out = JSON.parse(await tools.banyan_record_note(note(), { sessionID: "ses_x" }));
    expect(out.id).toBeTruthy();
    expect(vi.mocked(prisma.profileFact.upsert).mock.calls[0]![0].create).toMatchObject({ source: "task:task_9" });
  });

  it("returns a refusal to the model instead of failing the run", async () => {
    db.workspace = { status: "active", agentsPausedAt: new Date() };
    const tools = banyanToolDefinitions("ws_1", () => null);
    expect(await tools.banyan_read_context()).toMatch(/^Refused: .*paused/);
  });

  it("needs Node 24", () => {
    expect(nodeSupportsOpenCode("22.23.2")).toBe(false);
    expect(nodeSupportsOpenCode("24.0.0")).toBe(true);
  });
});
