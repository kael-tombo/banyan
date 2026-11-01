import { z } from "zod";
import { safeFetch, SafeFetchError, type SafeFetchOptions, type SafeFetchResult } from "@/lib/net/safe-fetch";
import { classifyHttpFailure, type DistributionError, type Result } from "@/lib/distribution/types";
import { errorResponse, ROUTES } from "@/lib/distribution/socialflow/contract";

/**
 * Low-level HTTP client for the SocialFlow.ai contract (US-031).
 *
 * Every call goes through safeFetch (SSRF guard, timeout, size cap) unless a
 * transport is injected — the contract tests inject a mock server. Responses
 * are validated against the contract schemas; anything else is an error,
 * never trusted. Credentials are only ever sent as a bearer header and are
 * never logged.
 */

export type Transport = (url: string, opts: SafeFetchOptions) => Promise<SafeFetchResult>;

export type ClientConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  transport?: Transport;
};

type Route = (typeof ROUTES)[keyof typeof ROUTES];

export function buildPath(route: Route, params: Record<string, string> = {}): string {
  return route.path.replace(/:(\w+)/g, (_, k: string) => {
    const v = params[k];
    if (!v) throw new Error(`Missing path parameter "${k}"`);
    return encodeURIComponent(v);
  });
}

export async function call<T extends z.ZodTypeAny>(
  cfg: ClientConfig,
  route: Route,
  schema: T,
  opts: { params?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Result<z.infer<T>> & { raw: unknown }> {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}${buildPath(route, opts.params)}`;
  const transport = cfg.transport ?? safeFetch;
  let res: SafeFetchResult;
  try {
    res = await transport(url, {
      method: route.method as SafeFetchOptions["method"],
      headers: {
        authorization: `Bearer ${cfg.apiKey}`,
        accept: "application/json",
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      timeoutMs: cfg.timeoutMs ?? 15_000,
      maxBytes: 1_000_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = /timed out/i.test(message);
    const blocked = err instanceof SafeFetchError && !timedOut;
    const error: DistributionError = blocked
      ? { code: "validation", message: `SocialFlow.ai URL refused: ${message}`, retryable: false }
      : classifyHttpFailure(null, { message: `SocialFlow.ai could not be reached: ${message}`, timedOut });
    return { ok: false, error, raw: { message } };
  }

  let raw: unknown = null;
  try {
    raw = res.text ? JSON.parse(res.text) : null;
  } catch {
    raw = { unparsable: res.text.slice(0, 500) };
  }

  if (res.status < 200 || res.status >= 300) {
    const parsed = errorResponse.safeParse(raw);
    const base = classifyHttpFailure(res.status, {
      retryAfter: res.headers.get("retry-after"),
      message: parsed.success ? `SocialFlow.ai: ${parsed.data.error.message}` : `SocialFlow.ai responded ${res.status}.`,
    });
    // A typed provider code is more precise than the status mapping.
    const error: DistributionError = parsed.success
      ? { ...base, code: parsed.data.error.code, retryable: ["rate_limited", "provider_unavailable"].includes(parsed.data.error.code) }
      : base;
    return { ok: false, error, raw };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "unknown", message: "SocialFlow.ai returned a response that does not match the contract.", retryable: false },
      raw,
    };
  }
  return { ok: true, value: parsed.data, raw };
}
