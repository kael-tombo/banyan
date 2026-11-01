import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Safe outbound fetch for URLs that originate from user input (today: the
 * distribution provider base URL; product URL intake). This is the
 * single choke point for the SSRF class of bugs:
 *
 *   - protocol allow-list: http/https only
 *   - every resolved IP (and IP literals) must be public: loopback, RFC-1918,
 *     CGNAT, link-local (incl. cloud metadata 169.254.169.254), multicast,
 *     reserved ranges, and IPv6 ULA/link-local/v4-mapped are rejected
 *   - redirects are followed manually (≤3) and re-validated on every hop
 *   - response bodies are capped (default 1 MB) and stream-truncated
 *   - caller timeout preserved via AbortSignal
 *
 * Trust boundary note: env-configured endpoints (OPENAI_BASE_URL,
 * FASTLANE_API_BASE_URL, WORKER_BASE_URL) are operator-controlled and are
 * deliberately NOT routed through this guard — blocking loopback would break
 * legitimate local gateways (Ollama, LM Studio) in self-hosted deployments.
 *
 * Residual risk (documented in docs/RELEASE_RUNBOOK.md): DNS rebinding TOCTOU
 * between validation and connection. Full pinning requires a custom undici
 * connect agent; deferred post-launch.
 */

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

const MAX_REDIRECTS = 3;
const DEFAULT_MAX_BYTES = 1_000_000; // 1 MB

/** IPv4 ranges that must never be fetched, as [lo, hi] 32-bit integers. */
const V4_FORBIDDEN: [number, number][] = (
  [
    ["0.0.0.0", "0.255.255.255"], // "this network"
    ["10.0.0.0", "10.255.255.255"], // RFC-1918
    ["100.64.0.0", "100.127.255.255"], // CGNAT
    ["127.0.0.0", "127.255.255.255"], // loopback
    ["169.254.0.0", "169.254.255.255"], // link-local + cloud metadata
    ["172.16.0.0", "172.31.255.255"], // RFC-1918
    ["192.0.0.0", "192.0.0.255"], // IETF protocol assignments
    ["192.168.0.0", "192.168.255.255"], // RFC-1918
    ["198.18.0.0", "198.19.255.255"], // benchmarking
    ["224.0.0.0", "239.255.255.255"], // multicast
    ["240.0.0.0", "255.255.255.255"], // reserved + broadcast
  ] as const
).map(([a, b]) => [v4ToInt(a), v4ToInt(b)]);

function v4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isForbiddenIPv4(ip: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return true; // malformed → treat as forbidden
  const n = v4ToInt(ip);
  return V4_FORBIDDEN.some(([lo, hi]) => n >= lo && n <= hi);
}

function isForbiddenIPv6(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, "");
  // IPv4-mapped (::ffff:10.0.0.1) — apply v4 rules to the embedded address.
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isForbiddenIPv4(mapped[1]);
  if (ip === "::" || ip === "::1") return true;
  const first = ip.split(":")[0];
  const inPrefix = (p: string) => first.startsWith(p);
  // fc00::/7 (ULA), fe80::/10 (link-local), ff00::/8 (multicast), 2001:db8::/32 (docs)
  if (inPrefix("fc") || inPrefix("fd")) return true;
  if (inPrefix("fe8") || inPrefix("fe9") || inPrefix("fea") || inPrefix("feb")) return true;
  if (inPrefix("ff")) return true;
  if (first === "2001:db8") return true;
  return false;
}

/** True when an IP is safe to connect to. Exported for tests. */
export function isPublicIp(ip: string): boolean {
  const version = net.isIP(ip.replace(/^\[|\]$/g, ""));
  if (version === 4) return !isForbiddenIPv4(ip);
  if (version === 6) return !isForbiddenIPv6(ip);
  return false; // not an IP at all → cannot be trusted without DNS
}

/**
 * Parse and validate a user-supplied URL without DNS: protocol must be
 * http/https and IP-literal hosts must be public. Returns the parsed URL.
 * Exported for tests.
 */
export function parseFetchableUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = raw instanceof URL ? new URL(raw.toString()) : new URL(raw);
  } catch {
    throw new SafeFetchError("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError(`Blocked: protocol ${url.protocol} is not allowed.`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !isPublicIp(host)) {
    throw new SafeFetchError("Blocked: private or reserved network address.");
  }
  return url;
}

/** Resolve a hostname and reject when any resolved address is non-public. */
async function assertResolvablePublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) return; // literal already checked
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SafeFetchError("Blocked: host could not be resolved.");
  }
  if (addresses.length === 0 || addresses.some((a) => !isPublicIp(a.address))) {
    throw new SafeFetchError("Blocked: host resolves to a private or reserved network address.");
  }
}

export type SafeFetchOptions = {
  method?: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
};

export type SafeFetchResult = {
  status: number;
  headers: Headers;
  text: string;
  truncated: boolean;
};

/**
 * Fetch a user-supplied URL with SSRF protections and a hard response-size
 * cap. Throws SafeFetchError with a user-safe message on any block.
 */
export async function safeFetch(rawUrl: string | URL, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { timeoutMs = 15_000, maxBytes = DEFAULT_MAX_BYTES } = opts;

  let current = parseFetchableUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertResolvablePublicHost(current.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method: hop === 0 ? (opts.method ?? "GET") : "GET", // redirects degrade to GET per fetch spec
        headers: hop === 0 ? opts.headers : undefined,
        body: hop === 0 ? opts.body : undefined,
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new SafeFetchError("Request timed out.");
      }
      throw new SafeFetchError("Request could not be completed.");
    } finally {
      clearTimeout(timer);
    }

    // 3xx: validate the next hop before following (no auto-fetch).
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return finish(res, maxBytes);
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new SafeFetchError("Blocked: invalid redirect target.");
      }
      void res.body?.cancel().catch(() => {});
      current = parseFetchableUrl(next); // re-validates protocol + IP literal
      continue; // DNS of the new host is re-checked at loop top
    }

    return finish(res, maxBytes);
  }
  throw new SafeFetchError("Blocked: too many redirects.");
}

/** Read the response body with a hard byte cap (stream-truncated). */
async function finish(res: Response, maxBytes: number): Promise<SafeFetchResult> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    void res.body?.cancel().catch(() => {});
    throw new SafeFetchError("Blocked: response too large.");
  }
  let text = "";
  let truncated = false;
  if (res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        truncated = true;
        void reader.cancel().catch(() => {});
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
    if (!truncated) text += decoder.decode();
  } else {
    text = await res.text();
  }
  return { status: res.status, headers: res.headers, text, truncated };
}

/**
 * Fetch an OPERATOR-configured endpoint (an env var, never user input) that
 * may legitimately live on a private network — e.g. SocialFlow Lite on the
 * same Docker network. Same timeout and response cap as safeFetch, http(s)
 * only, but no private-address check and redirects are NOT followed (a 3xx is
 * returned as-is, which callers treat as an error). Connection failures and
 * timeouts throw plain Errors so callers classify them as retryable, not as
 * a refused URL.
 *
 * Only reachable behind an explicit opt-in (SOCIALFLOW_ALLOW_PRIVATE_NETWORK).
 */
export async function operatorFetch(rawUrl: string | URL, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { timeoutMs = 15_000, maxBytes = DEFAULT_MAX_BYTES } = opts;
  let url: URL;
  try {
    url = new URL(rawUrl.toString());
  } catch {
    throw new SafeFetchError("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError(`Blocked: protocol ${url.protocol} is not allowed.`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers: opts.headers,
      body: opts.body,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Request timed out.");
    throw new Error("Request could not be completed.");
  } finally {
    clearTimeout(timer);
  }
  return finish(res, maxBytes);
}
