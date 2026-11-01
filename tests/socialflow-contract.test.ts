import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SocialFlowProvider } from "@/lib/distribution/socialflow/adapter";
import { publishRequest, IDEMPOTENCY_HEADER, CONTRACT_STATUS } from "@/lib/distribution/socialflow/contract";
import type { Transport } from "@/lib/distribution/socialflow/client";
import { classifyHttpFailure, parseRetryAfter } from "@/lib/distribution/types";
import { providerFor, enabledProviderIds } from "@/lib/distribution/providers";
import { SafeFetchError } from "@/lib/net/safe-fetch";

/**
 * Contract tests (US-030): the SocialFlow adapter against an in-memory mock of
 * the PROPOSED contract. They prove Banyan's side is ready; they do not prove
 * SocialFlow.ai works (nothing can, until it ships an API — US-037).
 */

const BASE = "https://socialflow.test";
const KEY = "sf-key-org1";

type Mode = "ok" | "queued-then-published" | "rate-limited" | "unauthorized" | "outage" | "timeout" | "malformed" | "post-failed" | "blocked-url";

function mockServer(mode: { current: Mode }) {
  const posts = new Map<string, { id: string; status: string; url: string | null }>();
  const seen: { method: string; path: string; headers: Record<string, string>; body: unknown }[] = [];
  let polls = 0;

  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
    status,
    headers: new Headers(headers),
    text: body === undefined ? "" : JSON.stringify(body),
    truncated: false,
  });

  const transport: Transport = async (url, opts) => {
    const u = new URL(url);
    const headers = opts.headers ?? {};
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    seen.push({ method: opts.method ?? "GET", path: u.pathname, headers, body });

    if (mode.current === "timeout") throw new SafeFetchError("Request timed out.");
    if (mode.current === "blocked-url") throw new SafeFetchError("Blocked: private or reserved network address.");
    if (mode.current === "outage") return reply(503, { error: { code: "provider_unavailable", message: "maintenance" } });
    if (mode.current === "unauthorized" || headers.authorization !== `Bearer ${KEY}`) {
      return reply(401, { error: { code: "auth_failed", message: "invalid api key" } });
    }
    if (mode.current === "rate-limited") return reply(429, { error: { code: "rate_limited", message: "slow down" } }, { "retry-after": "30" });
    if (mode.current === "malformed") return reply(200, { unexpected: true });

    if (u.pathname === "/v1/me") return reply(200, { organization_id: "org1", name: "Ledgerline" });
    if (u.pathname === "/v1/accounts" && opts.method === "GET") {
      return reply(200, {
        accounts: [
          { id: "acc-x", platform: "x", handle: "@ledgerline", status: "active", capabilities: { publish: true, schedule: true, analytics: false, formats: ["text"], max_length: 280 } },
          { id: "acc-li", platform: "linkedin", handle: "Ledgerline", status: "revoked", capabilities: { publish: true, schedule: false, analytics: false, formats: ["text"] } },
        ],
      });
    }
    if (u.pathname === "/v1/posts" && opts.method === "POST") {
      // The adapter must send a body that satisfies the contract.
      publishRequest.parse(body);
      const key = headers[IDEMPOTENCY_HEADER];
      if (!key) return reply(400, { error: { code: "validation", message: "Idempotency-Key required" } });
      if (mode.current === "post-failed") return reply(200, { id: "p-fail", status: "failed", url: null, error: { code: "unsupported_format", message: "threads over 280 chars" } });
      const existing = posts.get(key);
      if (existing) {
        if (mode.current === "queued-then-published" && ++polls >= 1) Object.assign(existing, { status: "published", url: "https://x.com/ledgerline/status/1" });
        return reply(200, existing);
      }
      const post =
        mode.current === "queued-then-published"
          ? { id: `p-${posts.size + 1}`, status: "queued", url: null }
          : { id: `p-${posts.size + 1}`, status: body.scheduled_at ? "scheduled" : "published", url: body.scheduled_at ? null : "https://x.com/ledgerline/status/1" };
      posts.set(key, post);
      return reply(201, post);
    }
    if (u.pathname.startsWith("/v1/posts/") && u.pathname.endsWith("/analytics")) return reply(404, { error: { code: "not_found", message: "no analytics" } });
    if (u.pathname.startsWith("/v1/posts/")) {
      const id = decodeURIComponent(u.pathname.split("/")[3]);
      const post = [...posts.values()].find((p) => p.id === id);
      return post ? reply(200, post) : reply(404, { error: { code: "not_found", message: "no such post" } });
    }
    return reply(404, { error: { code: "not_found", message: "route" } });
  };

  return { transport, seen, posts };
}

const ctx = { workspaceId: "ws1", credentials: { apiKey: KEY } };
const req = (over: Partial<Parameters<SocialFlowProvider["publish"]>[0]> = {}) => ({
  ctx,
  channel: "x",
  text: "You finish the job on the train. Ledgerline works offline.",
  idempotencyKey: "content1:now:now",
  ...over,
});

describe("SocialFlow.ai contract (US-030) — proposal, not a verified API", () => {
  it("is labelled as an unverified proposal", () => {
    expect(CONTRACT_STATUS).toBe("UNVERIFIED_PROPOSAL");
  });
});

describe("SocialFlowProvider against the mock contract (US-031)", () => {
  const mode = { current: "ok" as Mode };
  let server: ReturnType<typeof mockServer>;
  let sf: SocialFlowProvider;

  beforeEach(() => {
    mode.current = "ok";
    server = mockServer(mode);
    sf = new SocialFlowProvider({ baseUrl: BASE, transport: server.transport, enabledOverride: true });
  });

  it("validates credentials and reports only active channels", async () => {
    const v = await sf.validateCredentials(ctx);
    expect(v.ok).toBe(true);
    expect(v.channels).toEqual(["x"]); // the revoked LinkedIn account is not offered
  });

  it("publishes once and records the provider id and live URL", async () => {
    const out = await sf.publish(req());
    expect(out).toMatchObject({ ok: true, externalId: "p-1", externalUrl: "https://x.com/ledgerline/status/1" });
    const sent = server.seen.find((s) => s.path === "/v1/posts")!;
    expect(sent.headers[IDEMPOTENCY_HEADER]).toBe("content1:now:now");
    expect(sent.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it("never creates a duplicate post when the same publication is submitted twice", async () => {
    await sf.publish(req());
    await sf.publish(req());
    expect(server.posts.size).toBe(1);
  });

  it("does not treat an accepted-but-queued post as published; the retry confirms it", async () => {
    mode.current = "queued-then-published";
    const first = await sf.publish(req());
    expect(first.ok).toBe(false);
    expect(first.retryable).toBe(true);
    expect(first.error).toMatch(/not confirmed/i);
    const second = await sf.publish(req());
    expect(second).toMatchObject({ ok: true, externalUrl: "https://x.com/ledgerline/status/1" });
    expect(server.posts.size).toBe(1);
  });

  it("maps a rate limit to a retryable error with the provider's Retry-After", async () => {
    mode.current = "rate-limited";
    const out = await sf.publish(req());
    expect(out).toMatchObject({ ok: false, errorCode: "rate_limited", retryable: true, retryAfterMs: 30_000 });
  });

  it("maps bad credentials to a permanent auth_failed error", async () => {
    mode.current = "unauthorized";
    const out = await sf.publish(req());
    expect(out).toMatchObject({ ok: false, errorCode: "auth_failed", retryable: false });
  });

  it("treats an outage and a timeout as retryable", async () => {
    mode.current = "outage";
    expect(await sf.publish(req())).toMatchObject({ ok: false, errorCode: "provider_unavailable", retryable: true });
    mode.current = "timeout";
    expect(await sf.publish(req())).toMatchObject({ ok: false, errorCode: "timeout", retryable: true });
  });

  it("refuses a provider URL blocked by the SSRF guard, without retrying", async () => {
    mode.current = "blocked-url";
    expect(await sf.publish(req())).toMatchObject({ ok: false, errorCode: "validation", retryable: false });
  });

  it("rejects a response that does not match the contract instead of trusting it", async () => {
    mode.current = "malformed";
    expect(await sf.publish(req())).toMatchObject({ ok: false, errorCode: "unknown", retryable: false });
  });

  it("surfaces a provider-reported publishing failure with its code", async () => {
    mode.current = "post-failed";
    const out = await sf.publish(req());
    expect(out).toMatchObject({ ok: false, errorCode: "unsupported_format", retryable: false });
    expect(out.error).toMatch(/280/);
  });

  it("schedules with scheduled_at and accepts the scheduled status", async () => {
    const at = new Date("2026-11-02T09:00:00Z");
    const out = await sf.schedule({ ...req({ idempotencyKey: "content1:schedule:1" }), scheduledFor: at });
    expect(out.ok).toBe(true);
    expect((server.seen.at(-1)!.body as { scheduled_at: string }).scheduled_at).toBe(at.toISOString());
  });

  it("reads status back by provider id", async () => {
    const p = await sf.publish(req());
    const s = await sf.getStatus(ctx, p.externalId!);
    expect(s).toMatchObject({ ok: true, value: { state: "published" } });
  });

  it("reports analytics as unsupported rather than inventing numbers", async () => {
    const p = await sf.publish(req());
    const a = await sf.getAnalytics(ctx, p.externalId!);
    expect(a).toMatchObject({ ok: false, error: { code: "unsupported" } });
  });

  it("fails clearly without an API key, before any request", async () => {
    const out = await sf.publish(req({ ctx: { workspaceId: "ws1", credentials: {} } }));
    expect(out).toMatchObject({ ok: false, errorCode: "auth_failed" });
    expect(server.seen).toHaveLength(0);
  });
});

describe("SocialFlow.ai is disabled until verified (US-031, US-037)", () => {
  const saved = { url: process.env.SOCIALFLOW_API_URL, verified: process.env.SOCIALFLOW_VERIFIED };
  afterEach(() => {
    if (saved.url === undefined) delete process.env.SOCIALFLOW_API_URL; else process.env.SOCIALFLOW_API_URL = saved.url;
    if (saved.verified === undefined) delete process.env.SOCIALFLOW_VERIFIED; else process.env.SOCIALFLOW_VERIFIED = saved.verified;
  });

  it("is not returned by the registry without configuration", () => {
    delete process.env.SOCIALFLOW_API_URL;
    delete process.env.SOCIALFLOW_VERIFIED;
    expect(providerFor("socialflow")).toBeNull();
    expect(enabledProviderIds()).toEqual([]);
  });

  it("stays disabled with a URL but no verification", () => {
    process.env.SOCIALFLOW_API_URL = BASE;
    delete process.env.SOCIALFLOW_VERIFIED;
    expect(providerFor("socialflow")).toBeNull();
  });

  it("is enabled only with a URL and SOCIALFLOW_VERIFIED=true", () => {
    process.env.SOCIALFLOW_API_URL = BASE;
    process.env.SOCIALFLOW_VERIFIED = "true";
    expect(providerFor("socialflow")?.id).toBe("socialflow");
  });
});

describe("error normalisation (US-027)", () => {
  it.each([
    [401, "auth_failed", false],
    [403, "auth_failed", false],
    [410, "revoked", false],
    [404, "not_found", false],
    [422, "validation", false],
    [415, "unsupported_format", false],
    [500, "provider_unavailable", true],
    [503, "provider_unavailable", true],
  ] as const)("HTTP %i → %s (retryable %s)", (status, code, retryable) => {
    expect(classifyHttpFailure(status)).toMatchObject({ code, retryable });
  });

  it("network errors are retryable provider_unavailable; timeouts are timeout", () => {
    expect(classifyHttpFailure(null)).toMatchObject({ code: "provider_unavailable", retryable: true });
    expect(classifyHttpFailure(null, { timedOut: true })).toMatchObject({ code: "timeout", retryable: true });
  });

  it("parses Retry-After as seconds or an HTTP date", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    expect(parseRetryAfter("30", now)).toBe(30_000);
    expect(parseRetryAfter("Sun, 01 Nov 2026 10:01:00 GMT", now)).toBe(60_000);
    expect(parseRetryAfter("soon", now)).toBeUndefined();
  });
});
