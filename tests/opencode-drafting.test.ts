import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * R3: a writer agent proposes one draft per task, a critic flags it. These pin what the tools and
 * the flow do with the database; the agents themselves run in scripts/agent-runtime-check.mts.
 */

type Item = { id: string; workspaceId: string; sourceRef: string; status: string; body: string; checks: string; channel: string; format: string; title: string };

const db = vi.hoisted(() => ({
  items: [] as Item[],
  voice: JSON.stringify({ avoid: "revolutionary" }),
  workspace: { status: "active", agentsPausedAt: null } as Record<string, unknown> | null,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: { findUnique: vi.fn(async () => db.workspace) },
    productProfile: { findUnique: vi.fn(async () => ({ brandVoice: db.voice, name: "Acme" })) },
    campaign: { findFirst: vi.fn(async () => null) },
    contentItem: {
      findFirst: vi.fn(async ({ where }: { where: { sourceRef: string } }) => db.items.find((i) => i.sourceRef === where.sourceRef) ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.items.find((i) => i.id === where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Omit<Item, "id" | "checks"> }) => {
        const item = { id: `item_${db.items.length + 1}`, checks: "[]", ...data } as Item;
        db.items.push(item);
        return item;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Item> }) => Object.assign(db.items.find((i) => i.id === where.id)!, data)),
    },
  },
}));
vi.mock("@/lib/agents/handlers/common", () => ({
  loadBusinessContext: vi.fn(async () => ({})),
  contextBlock: () => "Product (user-provided): Acme",
  safeJSON: <T,>(s: string, fallback: T): T => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  },
}));
vi.mock("@/lib/ai/generate", () => ({ FORMAT_GUIDE: { linkedin: { insight: "A LinkedIn insight post." } } }));

const runs = vi.hoisted(() => ({ results: [] as unknown[], calls: [] as { agent: string; runId: string }[], quota: { allowed: true, reason: null as string | null, remaining: 5 } }));
vi.mock("@/lib/agents/runtime/opencode/agent-task", () => ({
  runAgentTask: vi.fn(async (args: { agent: string; runId: string }) => {
    runs.calls.push({ agent: args.agent, runId: args.runId });
    const next = runs.results.shift();
    if (next instanceof Error) throw next;
    if (typeof next === "function") return (next as () => unknown)();
    return next;
  }),
  modelsOf: () => "anthropic/claude-haiku-5-5",
}));
vi.mock("@/lib/model/router", () => ({ checkRunQuota: vi.fn(async () => runs.quota) }));

import { channelRules, flagDraft, MAX_CRITIC_FLAGS, proposeDraft } from "@/lib/agents/runtime/opencode/banyan-tools";
import { draftWithAgents } from "@/lib/agents/runtime/opencode/drafting";
import { parseFlags } from "@/lib/content/checks";
import { decideApproval } from "@/lib/autonomy/policy";

const task = { taskId: "task_1", channel: "linkedin", format: "insight" };
const POST = "Acme turns a messy weekly schedule into a plan your team can follow. Try it this week.";

beforeEach(() => {
  db.items = [];
  db.workspace = { status: "active", agentsPausedAt: null };
  runs.results = [];
  runs.calls = [];
  runs.quota = { allowed: true, reason: null, remaining: 5 };
});

describe("proposeDraft", () => {
  it("creates one draft per task, kept out of the review queue, and revises it on a second call", async () => {
    const first = await proposeDraft("ws_1", task, { body: POST });
    const second = await proposeDraft("ws_1", task, { body: `${POST} Second take.` });
    expect(second.id).toBe(first.id);
    expect(db.items).toHaveLength(1);
    expect(db.items[0]).toMatchObject({ status: "draft", sourceRef: "task:task_1", body: `${POST} Second take.` });
  });

  it("returns the checks the founder would see, so the writer can fix them", async () => {
    const r = await proposeDraft("ws_1", task, { body: `${POST} A revolutionary tool.` });
    expect(r.checks.join(" ")).toMatch(/revolutionary/);
  });

  it("refuses a draft that is too long, or one already submitted for review", async () => {
    await expect(proposeDraft("ws_1", { ...task, channel: "x", format: "single" }, { body: "word ".repeat(80) })).rejects.toThrow(/limit is 280/);
    await proposeDraft("ws_1", task, { body: POST });
    db.items[0]!.status = "ready_for_review";
    await expect(proposeDraft("ws_1", task, { body: POST })).rejects.toThrow(/already submitted/);
  });

  it("refuses when the task has no valid channel, or the agents are paused", async () => {
    await expect(proposeDraft("ws_1", { taskId: "t" }, { body: POST })).rejects.toThrow(/channel/);
    db.workspace = { status: "active", agentsPausedAt: new Date() };
    await expect(proposeDraft("ws_1", task, { body: POST })).rejects.toThrow(/paused/);
  });

  it("gives the writer the channel's rules, including terms to avoid", async () => {
    const rules = await channelRules("ws_1", task);
    expect(rules).toMatch(/LinkedIn/);
    expect(rules).toMatch(/revolutionary/);
    expect(rules).toMatch(/3000 characters/);
  });
});

describe("flagDraft", () => {
  it("stores critic flags on the draft once each, even when flagged in parallel", async () => {
    await proposeDraft("ws_1", task, { body: POST });
    const flag = { kind: "unsupported_claim", excerpt: "a plan your team can follow", note: "Nothing says teams follow it." };
    await Promise.all([flagDraft("ws_1", task, flag), flagDraft("ws_1", task, flag), flagDraft("ws_1", task, { ...flag, kind: "off_voice", note: "Too salesy." })]);
    const flags = parseFlags(db.items[0]!.checks);
    expect(flags.map((f) => (f.code === "critic" ? f.kind : f.code))).toEqual(["unsupported_claim", "off_voice"]);
  });

  it("refuses unknown kinds, flags without a quote, and more than the cap", async () => {
    await proposeDraft("ws_1", task, { body: POST });
    await expect(flagDraft("ws_1", task, { kind: "unchecked", excerpt: "x", note: "y" })).rejects.toThrow(/kind/);
    await expect(flagDraft("ws_1", task, { kind: "off_voice", excerpt: "", note: "y" })).rejects.toThrow(/Quote/);
    for (let i = 0; i < MAX_CRITIC_FLAGS; i++) await flagDraft("ws_1", task, { kind: "off_voice", excerpt: `phrase ${i}`, note: "n" });
    await expect(flagDraft("ws_1", task, { kind: "off_voice", excerpt: "one more", note: "n" })).rejects.toThrow(/Finish/);
  });
});

describe("draftWithAgents", () => {
  const args = { workspaceId: "ws_1", taskId: "task_1", attempt: 1, channel: "linkedin", format: "insight", campaignId: null, context: "ctx" };
  const completed = (perModel = "anthropic/claude-haiku-5-5") => ({ status: "completed", perModel: [{ model: perModel }], usage: { steps: 2 }, summary: "Saved." });

  it("runs the writer, then the critic on what the writer saved, as separate runs of one attempt", async () => {
    runs.results = [
      async () => {
        await proposeDraft("ws_1", task, { body: POST });
        return completed();
      },
      async () => {
        await flagDraft("ws_1", task, { kind: "risky_topic", excerpt: "messy weekly schedule", note: "Check tone." });
        return completed("openai/gpt-5.5");
      },
    ];
    const r = await draftWithAgents(args);
    expect(runs.calls).toEqual([{ agent: "writer", runId: "attempt-1" }, { agent: "critic", runId: "attempt-1-critic" }]);
    expect(r).toMatchObject({ ok: true, itemId: "item_1", criticFlags: 1, reviewed: true });
  });

  it("marks the draft unchecked when the critic fails, so it cannot be approved automatically", async () => {
    runs.results = [
      async () => {
        await proposeDraft("ws_1", task, { body: POST });
        return completed();
      },
      new Error("host down"),
    ];
    const r = await draftWithAgents(args);
    expect(r).toMatchObject({ ok: true, reviewed: false });
    const flags = parseFlags(db.items[0]!.checks);
    expect(flags).toEqual([expect.objectContaining({ code: "critic", kind: "unchecked" })]);
    const decision = decideApproval(
      { channel: "linkedin", status: "ready_for_review", flags, isFallback: false, channelHasPublished: true },
      { level: "supervised", channels: ["linkedin"], setById: "u", version: 1, maxPerDay: 5, escalateTopics: [] } as never
    );
    expect(decision.auto).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/critic could not review/);
  });

  it("returns the partial draft when the writer saved one and then failed, so the fallback fills it instead of adding another", async () => {
    runs.results = [
      async () => {
        await proposeDraft("ws_1", task, { body: POST });
        return { ...completed(), status: "failed", stopped: null };
      },
    ];
    const r = await draftWithAgents(args);
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/failed/), itemId: "item_1", stopped: false });
    expect(runs.calls).toHaveLength(1);
  });

  it("needs two quota units before starting either run", async () => {
    runs.quota = { allowed: true, reason: null, remaining: 0 };
    const r = await draftWithAgents(args);
    expect(r.ok).toBe(false);
    expect(runs.calls).toHaveLength(0);
  });
});

describe("the autonomy policy and critic flags", () => {
  const policy = { level: "supervised", channels: ["linkedin"], setById: "u", version: 1, maxPerDay: 5, escalateTopics: [] } as never;
  it("holds a draft the critic flagged, and passes one it reviewed without flags", () => {
    const base = { channel: "linkedin", status: "ready_for_review", isFallback: false, channelHasPublished: true };
    const flagged = decideApproval({ ...base, flags: [{ code: "critic", kind: "off_voice", excerpt: "x", message: "m" }] }, policy);
    expect(flagged.auto).toBe(false);
    expect(flagged.reasons.join(" ")).toMatch(/critic flagged/);
    expect(decideApproval({ ...base, flags: [] }, policy).auto).toBe(true);
  });
});

describe("the research brief from an agent", () => {
  it("cuts over-long lists rather than discarding a paid run, and leaves anything else alone", async () => {
    const { clampLists } = await import("@/lib/agents/runtime/opencode/research");
    const out = clampLists({ questions: Array(12).fill("q?"), hypothesisAngles: Array(7).fill("a"), sourcesNeeded: [], labelledAs: "hypothesis" }) as Record<string, unknown[]>;
    expect(out.questions).toHaveLength(10);
    expect(out.hypothesisAngles).toHaveLength(6);
    expect(clampLists("not json")).toBe("not json");
  });
});

describe("a writer stopped at its limit (R4)", () => {
  const args = { workspaceId: "ws_1", taskId: "task_1", attempt: 1, channel: "linkedin", format: "insight", campaignId: null, context: "ctx" };
  const stopped = { status: "budget_exhausted", stopped: "budget", perModel: [{ model: "m" }], usage: { steps: 9 }, summary: "", tokens: 90000 };
  const done = { status: "completed", stopped: null, perModel: [{ model: "m" }], usage: { steps: 2 }, summary: "Reviewed.", tokens: 100 };

  it("without a draft, says it stopped, so the handler writes the template instead of paying again", async () => {
    runs.results = [stopped];
    const r = await draftWithAgents(args);
    expect(r).toMatchObject({ ok: false, itemId: null, stopped: true });
    expect(runs.calls).toHaveLength(1);
  });

  it("with a draft saved, still has the critic review it, and says the writer stopped", async () => {
    runs.results = [
      async () => {
        await proposeDraft("ws_1", task, { body: POST });
        return stopped;
      },
      done,
    ];
    const r = await draftWithAgents(args);
    expect(r).toMatchObject({ ok: true, reviewed: true });
    expect(r.ok && r.label).toMatch(/stopped at its limit/);
    expect(runs.calls.map((c) => c.agent)).toEqual(["writer", "critic"]);
  });
});
