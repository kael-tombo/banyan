import { describe, it, expect } from "vitest";
import { AIError, OpenCodeSessionProvider } from "@/lib/ai/provider";

/**
 * The experimental OpenCode brain: text in, text out through a throwaway
 * session with every tool disabled, and a hard failure (never a hang) when
 * OpenCode cannot answer — the router then serves the labeled fallback.
 */
type Call = { url: string; method: string; body: unknown; headers: Record<string, string>; signal?: AbortSignal };

function fakeOpenCode(
  reply: (call: Call) => Response | Promise<Response>,
  status: () => Response = () => Response.json({})
) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: (init?.headers ?? {}) as Record<string, string>,
      signal: init?.signal ?? undefined,
    };
    calls.push(call);
    if (call.url.endsWith("/session") && call.method === "POST") return Response.json({ id: "ses_1" });
    if (call.url.endsWith("/abort") || call.method === "DELETE") return Response.json(true);
    if (call.url.endsWith("/session/status")) return status();
    return reply(call);
  }) as typeof fetch;
  return { impl, calls };
}

describe("OpenCodeSessionProvider", () => {
  it("returns the text parts, labeled as the experimental brain, with tools disabled", async () => {
    const oc = fakeOpenCode(() =>
      Response.json({
        info: { tokens: { input: 12, output: 7 } },
        parts: [{ type: "step-start" }, { type: "text", text: "Fresh bread, " }, { type: "text", text: "now in Tana." }],
      })
    );
    const p = new OpenCodeSessionProvider("http://127.0.0.1:4097/", "pw", "opencode/glm-5.3-flash-free", 5_000, oc.impl);
    const out = await p.complete({ system: "You write posts.", user: "Bakery launch", maxTokens: 200 });

    expect(out.text).toBe("Fresh bread, now in Tana.");
    expect(out.usage).toMatchObject({
      provider: "opencode-session",
      model: "opencode/glm-5.3-flash-free",
      isFallback: false,
      promptTokens: 12,
      completionTokens: 7,
    });
    expect(out.usage.label).toContain("Experimental brain (OpenCode)");

    const msg = oc.calls.find((c) => c.url.endsWith("/session/ses_1/message"))!;
    const body = msg.body as { model: unknown; system: string; tools: Record<string, boolean>; parts: unknown[] };
    expect(body.model).toEqual({ providerID: "opencode", modelID: "glm-5.3-flash-free" });
    expect(body.system).toBe("You write posts.");
    for (const tool of ["bash", "edit", "write", "read", "webfetch", "task"]) expect(body.tools[tool]).toBe(false);
    expect(msg.headers.authorization).toBe(`Basic ${Buffer.from("opencode:pw").toString("base64")}`);
  });

  it("surfaces an upstream model error instead of returning empty text", async () => {
    const oc = fakeOpenCode(() =>
      Response.json({ info: { error: { name: "APIError", data: { message: "This API key has expired." } } }, parts: [] })
    );
    const p = new OpenCodeSessionProvider("http://127.0.0.1:4097", "", "opencode-go/kimi-k3", 5_000, oc.impl);
    await expect(p.complete({ system: "s", user: "u", maxTokens: 10 })).rejects.toThrow(/API key has expired/);
  });

  it("times out (not hangs) when OpenCode keeps retrying, and aborts the session", async () => {
    // Never answers on its own — only the provider's abort signal ends it.
    const oc = fakeOpenCode(
      (call) =>
        new Promise<Response>((_, reject) => {
          call.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        })
    );
    const p = new OpenCodeSessionProvider("http://127.0.0.1:4097", "", "opencode/beam-free", 60, oc.impl);
    const err = await p.complete({ system: "s", user: "u", maxTokens: 10 }).catch((e) => e);
    expect(err).toBeInstanceOf(AIError);
    expect(String(err.message)).toMatch(/did not answer/);
    await new Promise((r) => setTimeout(r, 10));
    expect(oc.calls.some((c) => c.url.endsWith("/session/ses_1/abort"))).toBe(true);
  });

  it("fails fast when OpenCode reports it is stuck retrying a quota error", async () => {
    const oc = fakeOpenCode(
      (call) =>
        new Promise<Response>((_, reject) => {
          call.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
      () =>
        Response.json({
          ses_1: { type: "retry", attempt: 1, message: "Free usage exceeded, subscribe to Go", action: { reason: "free_tier_limit" } },
        })
    );
    const p = new OpenCodeSessionProvider("http://127.0.0.1:4097", "", "opencode/beam-free", 30_000, oc.impl, 5);
    const started = Date.now();
    await expect(p.complete({ system: "s", user: "u", maxTokens: 10 })).rejects.toThrow(/Free usage exceeded/);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("rejects a model id without a provider prefix", async () => {
    const oc = fakeOpenCode(() => Response.json({}));
    const p = new OpenCodeSessionProvider("http://127.0.0.1:4097", "", "just-a-model", 5_000, oc.impl);
    await expect(p.complete({ system: "s", user: "u", maxTokens: 10 })).rejects.toThrow(/provider\/model/);
    expect(oc.calls).toHaveLength(0);
  });
});
