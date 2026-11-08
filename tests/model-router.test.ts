import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What a founder gets when a provider misbehaves: one more try on a blip, a
 * labeled template only after that, a quota an outage cannot eat, and an
 * honest record of which of those happened.
 */

const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  liveCount: vi.fn(async () => 0),
  complete: vi.fn(),
  live: { value: true },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    modelCall: {
      count: mocks.liveCount,
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mocks.rows.push(data);
        return { id: `call_${mocks.rows.length}` };
      }),
    },
  },
}));

vi.mock("@/lib/ai/provider", async (original) => {
  const actual = await original<typeof import("@/lib/ai/provider")>();
  const usage = { provider: "openai-compat", model: "gpt-x", isFallback: false, label: "Live model: gpt-x" };
  return {
    ...actual,
    getAIProvider: () =>
      mocks.live.value
        ? { provider: { name: "openai-compat", complete: mocks.complete }, usage }
        : { provider: new actual.TemplateFallbackProvider(), usage: { ...usage, isFallback: true } },
  };
});

import { AIError } from "@/lib/ai/provider";
import { ROUTER_RETRY, countLiveModelActionsToday, routeComplete } from "@/lib/model/router";

const ok = { text: "A real draft.", usage: { provider: "openai-compat", model: "gpt-x", isFallback: false, label: "Live model: gpt-x", promptTokens: 10, completionTokens: 5 } };
const req = { workspaceId: "ws", purpose: "content_draft" as const, system: "s", user: "u", maxTokens: 100 };

beforeEach(() => {
  mocks.rows.length = 0;
  mocks.complete.mockReset();
  mocks.liveCount.mockReset();
  mocks.liveCount.mockResolvedValue(0);
  mocks.live.value = true;
  ROUTER_RETRY.delayMs = 0;
  ROUTER_RETRY.withinMs = 30_000;
});

describe("routeComplete", () => {
  it("retries a transient failure, so one 429 does not become a template draft", async () => {
    mocks.complete.mockRejectedValueOnce(new AIError("Model provider returned 429", true)).mockResolvedValueOnce(ok);
    const res = await routeComplete(req);
    expect(res.text).toBe("A real draft.");
    expect(res.usage.isFallback).toBe(false);
    expect(res.providerError).toBeUndefined();
    expect(mocks.complete).toHaveBeenCalledTimes(2);
    // Both tries are in the ledger, in order, and only the second succeeded.
    expect(mocks.rows.map((r) => [r.ok, r.attempt])).toEqual([[false, 1], [true, 2]]);
  });

  it("does not retry a permanent failure", async () => {
    mocks.complete.mockRejectedValue(new AIError("Model provider returned 401: bad key", false));
    const res = await routeComplete(req);
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(res.usage.isFallback).toBe(true);
    expect(res.providerError).toContain("401");
  });

  it("gives up after the retry and serves a template that says why, keeping the provider's words out of the label", async () => {
    mocks.complete.mockRejectedValue(new AIError("Model provider returned 503: internal cluster xyz-9 down", true));
    const res = await routeComplete(req);
    expect(mocks.complete).toHaveBeenCalledTimes(ROUTER_RETRY.attempts);
    expect(res.usage.isFallback).toBe(true);
    expect(res.usage.label).toContain("The live model failed");
    expect(res.usage.label).not.toContain("xyz-9");
    expect(res.providerError).toContain("xyz-9");
  });

  it("does not hold a request for a second full timeout when the first was already slow", async () => {
    ROUTER_RETRY.withinMs = 0;
    mocks.complete.mockRejectedValue(new AIError("Model provider timed out.", true));
    await routeComplete(req);
    expect(mocks.complete).toHaveBeenCalledTimes(1);
  });

  it("tells a missing provider apart from a failing one", async () => {
    mocks.live.value = false;
    const res = await routeComplete(req);
    expect(res.usage.isFallback).toBe(true);
    expect(res.usage.label).toContain("No live model provider available");
    expect(res.providerError).toBeUndefined();
  });

  it("keeps the workflow's own attempt number as the starting point in the ledger", async () => {
    mocks.complete.mockRejectedValueOnce(new AIError("blip", true)).mockResolvedValueOnce(ok);
    await routeComplete({ ...req, attempt: 3 });
    expect(mocks.rows.map((r) => r.attempt)).toEqual([3, 4]);
  });

  it("serves the template without calling the provider once the quota is used", async () => {
    mocks.liveCount.mockResolvedValue(1_000_000);
    const res = await routeComplete(req);
    expect(res.quotaDeferred).toBe(true);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});

describe("the daily quota", () => {
  it("counts only calls that worked, so an outage cannot use up a founder's allowance", async () => {
    await countLiveModelActionsToday("ws");
    const where = (mocks.liveCount.mock.calls as unknown as [{ where: Record<string, unknown> }][])[0]![0].where;
    expect(where).toMatchObject({ workspaceId: "ws", isFallback: false, ok: true });
  });
});
