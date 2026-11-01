import type { SafeFetchOptions, SafeFetchResult } from "@/lib/net/safe-fetch";
import type { Transport } from "@/lib/distribution/socialflow/client";

/**
 * SocialFlow over MCP (Model Context Protocol, Streamable HTTP).
 *
 * The SocialFlow adapter speaks the REST contract (contract.ts). This
 * transport carries each contract call as the MCP tool that mirrors it on
 * SocialFlow Lite's /mcp endpoint, and turns the tool result's
 * structuredContent { status, body, retry_after } back into an HTTP-shaped
 * result. The adapter's validation, retry and idempotency rules therefore
 * apply unchanged whichever transport is configured (SOCIALFLOW_TRANSPORT).
 *
 * One `initialize` handshake per server per process, as the protocol requires.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";

type ToolCall = { name: string; args: Record<string, unknown> } | { unsupported: string };

/** Map one REST contract call onto its MCP tool. */
export function toolFor(method: string, path: string, body: Record<string, unknown> | undefined, headers: Record<string, string>): ToolCall {
  const seg = path.replace(/\/+$/, "").split("/").filter(Boolean).map(decodeURIComponent); // ["v1", ...]
  const m = method.toUpperCase();
  const key = headers["Idempotency-Key"] ?? headers["idempotency-key"];
  if (m === "GET" && seg.length === 2 && seg[1] === "me") return { name: "whoami", args: {} };
  if (m === "GET" && seg.length === 2 && seg[1] === "accounts") return { name: "list_accounts", args: {} };
  if (m === "POST" && seg[1] === "accounts" && seg[2] === "connect") return { name: "start_account_connection", args: { platform: body?.platform } };
  if (m === "GET" && seg[1] === "accounts" && seg[3] === "capabilities") return { name: "get_account_capabilities", args: { account_id: seg[2] } };
  if (m === "DELETE" && seg[1] === "accounts" && seg.length === 3) return { name: "disconnect_account", args: { account_id: seg[2] } };
  if (m === "POST" && seg.length === 2 && seg[1] === "posts") {
    return { name: body?.scheduled_at ? "schedule_post" : "publish_post", args: { ...(body ?? {}), ...(key ? { idempotency_key: key } : {}) } };
  }
  if (m === "GET" && seg[1] === "posts" && seg[3] === "analytics") return { unsupported: "analytics" };
  if (m === "GET" && seg[1] === "posts" && seg.length === 3) return { name: "get_post_status", args: { post_id: seg[2] } };
  if (m === "DELETE" && seg[1] === "posts" && seg.length === 3) return { name: "cancel_post", args: { post_id: seg[2] } };
  return { unsupported: `${m} ${path}` };
}

function result(status: number, body: unknown, retryAfter?: number): SafeFetchResult {
  const headers = new Headers({ "content-type": "application/json" });
  if (retryAfter !== undefined) headers.set("retry-after", String(retryAfter));
  return { status, headers, text: JSON.stringify(body ?? {}), truncated: false };
}

const initialized = new Map<string, Promise<string | null>>();

/** For tests: forget handshakes. */
export function resetMcpSessions(): void {
  initialized.clear();
}

/**
 * Wrap a byte transport (safeFetch, or operatorFetch for a private network)
 * so contract calls go to `<origin>/mcp` as MCP tool calls.
 */
export function mcpTransport(base: Transport): Transport {
  let nextId = 1;
  const rpc = async (endpoint: string, auth: string, sessionId: string | null, msg: Record<string, unknown>, opts: SafeFetchOptions) => {
    const res = await base(endpoint, {
      method: "POST",
      headers: {
        authorization: auth,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", ...msg }),
      timeoutMs: opts.timeoutMs,
      maxBytes: opts.maxBytes,
    });
    return res;
  };

  return async (url, opts) => {
    const u = new URL(url);
    const endpoint = `${u.origin}/mcp`;
    const headers = opts.headers ?? {};
    const auth = headers.authorization ?? headers.Authorization ?? "";
    let body: Record<string, unknown> | undefined;
    try {
      body = opts.body ? (JSON.parse(opts.body) as Record<string, unknown>) : undefined;
    } catch {
      body = undefined;
    }
    const call = toolFor(opts.method ?? "GET", u.pathname, body, headers);
    if ("unsupported" in call) {
      return result(404, { error: { code: "not_found", message: `SocialFlow's MCP server offers no tool for ${call.unsupported}.` } });
    }

    // Handshake once per endpoint and key; a failed handshake is retried next call.
    const sessionKey = `${endpoint}|${auth}`;
    let session = initialized.get(sessionKey);
    if (!session) {
      session = (async () => {
        const res = await rpc(endpoint, auth, null, { id: nextId++, method: "initialize", params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "banyan", version: "1.0.0" } } }, opts);
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error("auth"), { authStatus: res.status, text: res.text });
        if (res.status < 200 || res.status >= 300) throw new Error(`MCP initialize failed with HTTP ${res.status}`);
        const reply = JSON.parse(res.text || "{}") as { error?: { message?: string } };
        if (reply.error) throw new Error(`MCP initialize refused: ${reply.error.message ?? "unknown error"}`);
        const sid = res.headers.get("mcp-session-id");
        await rpc(endpoint, auth, sid, { method: "notifications/initialized" }, opts);
        return sid;
      })();
      initialized.set(sessionKey, session);
    }
    let sessionId: string | null;
    try {
      sessionId = await session;
    } catch (err) {
      initialized.delete(sessionKey);
      const e = err as Error & { authStatus?: number; text?: string };
      if (e.authStatus) return { status: e.authStatus, headers: new Headers(), text: e.text ?? "", truncated: false };
      throw err;
    }

    const res = await rpc(endpoint, auth, sessionId, { id: nextId++, method: "tools/call", params: { name: call.name, arguments: call.args } }, opts);
    if (res.status === 401 || res.status === 403) return res; // the contract's auth error body passes through
    if (res.status === 404 && sessionId) initialized.delete(sessionKey); // expired session: handshake again next time
    if (res.status < 200 || res.status >= 300) return result(res.status >= 500 ? 502 : res.status, { error: { code: "provider_unavailable", message: `SocialFlow's MCP endpoint answered HTTP ${res.status}.` } });

    let reply: { result?: { structuredContent?: { status?: number; body?: unknown; retry_after?: number }; isError?: boolean }; error?: { message?: string } };
    try {
      reply = JSON.parse(res.text);
    } catch {
      return result(502, { error: { code: "provider_unavailable", message: "SocialFlow's MCP endpoint returned something that is not JSON-RPC." } });
    }
    if (reply.error) return result(400, { error: { code: "validation", message: `MCP: ${reply.error.message ?? "request refused"}` } });
    const sc = reply.result?.structuredContent;
    if (!sc || typeof sc.status !== "number") {
      return result(502, { error: { code: "provider_unavailable", message: "SocialFlow's MCP tool result had no structured status." } });
    }
    return result(sc.status, sc.body, typeof sc.retry_after === "number" ? sc.retry_after : undefined);
  };
}
