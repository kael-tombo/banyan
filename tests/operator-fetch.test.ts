import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { operatorFetch, safeFetch, SafeFetchError } from "@/lib/net/safe-fetch";
import { defaultTransport } from "@/lib/distribution/socialflow/adapter";

/**
 * operatorFetch is the opt-in transport for an operator-configured SocialFlow
 * URL on a private network (SocialFlow Lite beside Banyan). A real loopback
 * server stands in for it.
 */
let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" });
      return res.end();
    }
    if (req.url === "/huge") {
      res.writeHead(200, { "content-length": String(2_000_000) });
      return res.end("x".repeat(2_000_000));
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ method: req.method, auth: req.headers.authorization ?? null, body }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

afterEach(() => {
  delete process.env.SOCIALFLOW_ALLOW_PRIVATE_NETWORK;
});

describe("operatorFetch", () => {
  it("reaches a loopback endpoint that safeFetch refuses", async () => {
    await expect(safeFetch(`${base}/v1/me`)).rejects.toBeInstanceOf(SafeFetchError);
    const res = await operatorFetch(`${base}/v1/posts`, { method: "POST", headers: { authorization: "Bearer k" }, body: '{"a":1}' });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toEqual({ method: "POST", auth: "Bearer k", body: '{"a":1}' });
  });

  it("never follows redirects (a 3xx is returned, not chased to metadata)", async () => {
    const res = await operatorFetch(`${base}/redirect`);
    expect(res.status).toBe(302);
  });

  it("keeps the response size cap", async () => {
    await expect(operatorFetch(`${base}/huge`)).rejects.toThrow(/too large/);
  });

  it("refuses non-http protocols", async () => {
    await expect(operatorFetch("file:///etc/passwd")).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("reports an unreachable host as a plain (retryable) error, not a refused URL", async () => {
    const err = await operatorFetch("http://127.0.0.1:1/").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SafeFetchError);
  });
});

describe("SocialFlow default transport", () => {
  it("keeps the SSRF guard unless the operator opts in", () => {
    expect(defaultTransport()).toBeUndefined();
    process.env.SOCIALFLOW_ALLOW_PRIVATE_NETWORK = "true";
    expect(defaultTransport()).toBe(operatorFetch);
    process.env.SOCIALFLOW_ALLOW_PRIVATE_NETWORK = "1";
    expect(defaultTransport()).toBeUndefined();
  });
});
