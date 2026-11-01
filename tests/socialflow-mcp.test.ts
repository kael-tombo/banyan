import { beforeEach, describe, expect, it } from "vitest";
import { mcpTransport, resetMcpSessions, toolFor } from "@/lib/distribution/socialflow/mcp-transport";
import { SocialFlowProvider } from "@/lib/distribution/socialflow/adapter";
import type { Transport } from "@/lib/distribution/socialflow/client";

/** A minimal MCP server (JSON-RPC over one POST endpoint) mirroring SocialFlow Lite's tool results. */
function fakeMcp(opts: { toolStatus?: (name: string, args: Record<string, unknown>) => { status: number; body: unknown; retry_after?: number } | undefined } = {}) {
  const seen: { method: string; name?: string; args?: Record<string, unknown>; auth?: string }[] = [];
  const posts = new Map<string, { id: string; status: string; url: string }>();
  const reply = (body: unknown, status = 200) => ({ status, headers: new Headers({ "content-type": "application/json" }), text: JSON.stringify(body), truncated: false });
  const transport: Transport = async (url, o) => {
    expect(url).toBe("https://sf.test/mcp");
    const msg = JSON.parse(o.body ?? "{}");
    seen.push({ method: msg.method, name: msg.params?.name, args: msg.params?.arguments, auth: o.headers?.authorization });
    if (o.headers?.authorization !== "Bearer k") return reply({ error: { code: "auth_failed", message: "Invalid or revoked API key." } }, 401);
    if (msg.method === "initialize") return reply({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "socialflow-lite" } } });
    if (!msg.id) return { status: 202, headers: new Headers(), text: "", truncated: false };
    if (msg.method !== "tools/call") return reply({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } });
    const { name, arguments: args } = msg.params;
    let sc = opts.toolStatus?.(name, args);
    if (!sc) {
      if (name === "whoami") sc = { status: 200, body: { organization_id: "org1" } };
      else if (name === "list_accounts") sc = { status: 200, body: { accounts: [{ id: "a1", platform: "linkedin", handle: "Ada", status: "active", capabilities: { publish: true, schedule: true, analytics: false, formats: ["post"] }, token_expires_at: "2026-12-31T00:00:00Z" }] } };
      else if (name === "publish_post") {
        const existing = posts.get(args.idempotency_key);
        const post = existing ?? { id: `p${posts.size + 1}`, status: "published", url: "https://www.linkedin.com/feed/update/urn:li:share:1/" };
        posts.set(args.idempotency_key, post);
        sc = { status: existing ? 200 : 201, body: post };
      } else if (name === "get_post_status") sc = { status: 200, body: { id: args.post_id, status: "published", url: "https://www.linkedin.com/feed/update/urn:li:share:1/" } };
      else sc = { status: 404, body: { error: { code: "not_found", message: "no" } } };
    }
    return reply({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: JSON.stringify(sc) }], structuredContent: sc, isError: sc.status >= 400 } });
  };
  return { transport, seen, posts };
}

const ctx = { workspaceId: "ws", credentials: { apiKey: "k" } };

beforeEach(() => resetMcpSessions());

describe("contract call → MCP tool", () => {
  it("maps every contract operation", () => {
    expect(toolFor("GET", "/v1/me", undefined, {})).toEqual({ name: "whoami", args: {} });
    expect(toolFor("GET", "/v1/accounts", undefined, {})).toEqual({ name: "list_accounts", args: {} });
    expect(toolFor("POST", "/v1/accounts/connect", { platform: "x" }, {})).toEqual({ name: "start_account_connection", args: { platform: "x" } });
    expect(toolFor("GET", "/v1/accounts/a%2F1/capabilities", undefined, {})).toEqual({ name: "get_account_capabilities", args: { account_id: "a/1" } });
    expect(toolFor("DELETE", "/v1/accounts/a1", undefined, {})).toEqual({ name: "disconnect_account", args: { account_id: "a1" } });
    expect(toolFor("POST", "/v1/posts", { channel: "x", text: "t" }, { "Idempotency-Key": "k1" })).toEqual({ name: "publish_post", args: { channel: "x", text: "t", idempotency_key: "k1" } });
    expect(toolFor("POST", "/v1/posts", { channel: "x", text: "t", scheduled_at: "2026-11-03T09:00:00Z" }, { "Idempotency-Key": "k2" })).toMatchObject({ name: "schedule_post" });
    expect(toolFor("GET", "/v1/posts/p1", undefined, {})).toEqual({ name: "get_post_status", args: { post_id: "p1" } });
    expect(toolFor("GET", "/v1/posts/p1/analytics", undefined, {})).toEqual({ unsupported: "analytics" });
    expect(toolFor("DELETE", "/v1/posts/p1", undefined, {})).toEqual({ name: "cancel_post", args: { post_id: "p1" } });
  });
});

describe("SocialFlowProvider over MCP", () => {
  it("publishes through the tools, handshaking once", async () => {
    const mcp = fakeMcp();
    const sf = new SocialFlowProvider({ baseUrl: "https://sf.test", transport: mcpTransport(mcp.transport), enabledOverride: true });
    const v = await sf.validateCredentials(ctx);
    expect(v).toMatchObject({ ok: true, channels: ["linkedin"] });
    const out = await sf.publish({ ctx, channel: "linkedin", text: "hello", idempotencyKey: "item1:now:now" });
    expect(out).toMatchObject({ ok: true, externalId: "p1", externalUrl: "https://www.linkedin.com/feed/update/urn:li:share:1/" });
    await sf.publish({ ctx, channel: "linkedin", text: "hello", idempotencyKey: "item1:now:now" });
    expect(mcp.posts.size).toBe(1);
    const st = await sf.getStatus(ctx, "p1");
    expect(st).toMatchObject({ ok: true, value: { state: "published" } });
    const accounts = await sf.listAccounts(ctx);
    expect(accounts.ok && accounts.value[0].tokenExpiresAt?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(mcp.seen.filter((s) => s.method === "initialize")).toHaveLength(1);
    expect(mcp.seen.filter((s) => s.method === "notifications/initialized")).toHaveLength(1);
    expect(mcp.seen.find((s) => s.name === "publish_post")?.args).toMatchObject({ idempotency_key: "item1:now:now", channel: "linkedin" });
  });

  it("keeps the contract's retry rules: a rate limit is retryable with its delay", async () => {
    const mcp = fakeMcp({ toolStatus: (n) => (n === "publish_post" ? { status: 429, body: { error: { code: "rate_limited", message: "slow down" } }, retry_after: 30 } : undefined) });
    const sf = new SocialFlowProvider({ baseUrl: "https://sf.test", transport: mcpTransport(mcp.transport), enabledOverride: true });
    const out = await sf.publish({ ctx, channel: "linkedin", text: "hello", idempotencyKey: "k" });
    expect(out).toMatchObject({ ok: false, retryable: true, errorCode: "rate_limited" });
    expect(out.retryAfterMs).toBe(30_000);
  });

  it("passes a rejected key through as auth_failed", async () => {
    const mcp = fakeMcp();
    const sf = new SocialFlowProvider({ baseUrl: "https://sf.test", transport: mcpTransport(mcp.transport), enabledOverride: true });
    const v = await sf.validateCredentials({ workspaceId: "ws", credentials: { apiKey: "wrong" } });
    expect(v.ok).toBe(false);
    expect(v.detail).toContain("Invalid or revoked API key");
  });

  it("cancels a scheduled post through cancel_post (C8)", async () => {
    const mcp = fakeMcp({ toolStatus: (n, a) => (n === "cancel_post" ? { status: 200, body: { id: a.post_id, status: "cancelled" } } : undefined) });
    const sf = new SocialFlowProvider({ baseUrl: "https://sf.test", transport: mcpTransport(mcp.transport), enabledOverride: true });
    const out = await sf.cancelScheduled(ctx, "p9");
    expect(out).toEqual({ ok: true, value: { state: "cancelled" } });
    expect(mcp.seen.find((s) => s.name === "cancel_post")?.args).toEqual({ post_id: "p9" });
  });

  it("does not report a cancel that SocialFlow refused (already published)", async () => {
    const mcp = fakeMcp({ toolStatus: (n) => (n === "cancel_post" ? { status: 409, body: { error: { code: "conflict", message: "already published; delete it on the platform itself" } } } : undefined) });
    const sf = new SocialFlowProvider({ baseUrl: "https://sf.test", transport: mcpTransport(mcp.transport), enabledOverride: true });
    const out = await sf.cancelScheduled(ctx, "p1");
    expect(out.ok).toBe(false);
  });

  it("does not trust a cancel answer whose status is not cancelled", async () => {
    const mcp = fakeMcp({ toolStatus: (n, a) => (n === "cancel_post" ? { status: 200, body: { id: a.post_id, status: "published", url: "https://x.com/i/web/status/1" } } : undefined) });
    const sf = new SocialFlowProvider({ baseUrl: "https://sf.test", transport: mcpTransport(mcp.transport), enabledOverride: true });
    const out = await sf.cancelScheduled(ctx, "p1");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.message).toContain("instead of cancelled");
  });

  it("does not keep retrying a replay that comes back cancelled", async () => {
    const mcp = fakeMcp({ toolStatus: (n) => (n === "publish_post" ? { status: 200, body: { id: "p1", status: "cancelled" } } : undefined) });
    const sf = new SocialFlowProvider({ baseUrl: "https://sf.test", transport: mcpTransport(mcp.transport), enabledOverride: true });
    const out = await sf.publish({ ctx, channel: "linkedin", text: "hello", idempotencyKey: "k" });
    expect(out).toMatchObject({ ok: false, retryable: false });
  });

  it("answers analytics honestly as unsupported, without a network call", async () => {
    const mcp = fakeMcp();
    const sf = new SocialFlowProvider({ baseUrl: "https://sf.test", transport: mcpTransport(mcp.transport), enabledOverride: true });
    const a = await sf.getAnalytics(ctx, "p1");
    expect(a.ok).toBe(false);
    expect(mcp.seen.some((s) => s.name?.includes("analytics"))).toBe(false);
  });

  it("is selected by SOCIALFLOW_TRANSPORT=mcp", async () => {
    const { defaultTransport } = await import("@/lib/distribution/socialflow/adapter");
    const prev = process.env.SOCIALFLOW_TRANSPORT;
    process.env.SOCIALFLOW_TRANSPORT = "mcp";
    try {
      expect(typeof defaultTransport()).toBe("function");
    } finally {
      if (prev === undefined) delete process.env.SOCIALFLOW_TRANSPORT;
      else process.env.SOCIALFLOW_TRANSPORT = prev;
    }
    expect(defaultTransport()).toBeUndefined();
  });
});
