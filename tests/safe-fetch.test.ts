import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { isPublicIp, parseFetchableUrl, SafeFetchError, safeFetch } from "@/lib/net/safe-fetch";

/**
 * Unit coverage for the SSRF choke point. DNS is mocked; no test performs a
 * real network call. The end-to-end behavior (connection creation against a
 * private host) is additionally covered by scripts/e2e-acceptance.sh.
 */
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

const mockLookup = vi.mocked(lookup);

beforeEach(() => {
  mockLookup.mockReset();
  mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isPublicIp — forbidden ranges", () => {
  const forbidden = [
    "127.0.0.1", // loopback
    "127.255.255.255",
    "10.1.2.3", // RFC-1918
    "172.16.0.1", // RFC-1918 lower edge
    "172.31.255.255", // RFC-1918 upper edge
    "192.168.1.1", // RFC-1918
    "169.254.169.254", // cloud metadata
    "0.0.0.0",
    "100.64.0.1", // CGNAT
    "198.18.0.1", // benchmarking
    "224.0.0.1", // multicast
    "240.0.0.1", // reserved
    "255.255.255.255", // broadcast
    "::1", // IPv6 loopback
    "::", // unspecified
    "fe80::1", // IPv6 link-local
    "fc00::1", // IPv6 ULA
    "fd12:3456::1", // IPv6 ULA
    "ff02::1", // IPv6 multicast
    "::ffff:127.0.0.1", // v4-mapped loopback
    "::ffff:10.0.0.9", // v4-mapped RFC-1918
  ];
  it.each(forbidden)("rejects %s", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });
});

describe("isPublicIp — public addresses", () => {
  const allowed = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34", "2606:4700::1111", "::ffff:8.8.8.8"];
  it.each(allowed)("allows %s", (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });
});

describe("parseFetchableUrl", () => {
  it("rejects non-http protocols", () => {
    expect(() => parseFetchableUrl("ftp://example.com/file")).toThrow(SafeFetchError);
    expect(() => parseFetchableUrl("file:///etc/passwd")).toThrow(SafeFetchError);
    expect(() => parseFetchableUrl("gopher://example.com")).toThrow(SafeFetchError);
  });

  it("rejects private IP literals without touching DNS", () => {
    expect(() => parseFetchableUrl("http://127.0.0.1:8080/admin")).toThrow(/private or reserved/);
    expect(() => parseFetchableUrl("http://169.254.169.254/latest/meta-data/")).toThrow(/private or reserved/);
    expect(() => parseFetchableUrl("https://[::1]:3000/")).toThrow(/private or reserved/);
  });

  it("rejects malformed URLs", () => {
    expect(() => parseFetchableUrl("not a url")).toThrow(SafeFetchError);
  });

  it("accepts public https URLs and public IP literals", () => {
    expect(parseFetchableUrl("https://api.postiz.com/public/v1/integrations").hostname).toBe("api.postiz.com");
    expect(parseFetchableUrl("http://8.8.8.8/dns-query").hostname).toBe("8.8.8.8");
  });
});

describe("safeFetch — DNS-level blocking", () => {
  it("blocks hostnames that resolve to a private address", async () => {
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.0.10", family: 4 },
    ] as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("fetch must not be called for private hosts");
      })
    );
    await expect(safeFetch("https://rebind.example.com/")).rejects.toThrow(/private or reserved/);
    expect(mockLookup).toHaveBeenCalled();
  });

  it("blocks unresolvable hostnames with a clear message", async () => {
    mockLookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(safeFetch("https://nope.example.com/")).rejects.toThrow(/could not be resolved/);
  });
});

describe("safeFetch — redirect re-validation", () => {
  it("blocks redirects to private networks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }))
    );
    await expect(safeFetch("https://public.example.com/start")).rejects.toThrow(/private or reserved/);
  });

  it("blocks non-http redirect targets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Response(null, { status: 301, headers: { location: "ftp://evil.example.com/x" } }))
    );
    await expect(safeFetch("https://public.example.com/start")).rejects.toThrow(/protocol/);
  });

  it("follows validated public redirects (per-hop DNS check)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://final.example.com/ok" } }))
      .mockResolvedValueOnce(new Response("done", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await safeFetch("https://start.example.com/redirect");
    expect(res.status).toBe(200);
    expect(res.text).toBe("done");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]![0] as string).startsWith("https://final.example.com/ok")).toBe(true);
  });

  it("gives up after too many redirects", async () => {
    const fetchMock = vi.fn(() => new Response(null, { status: 302, headers: { location: "/next" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(safeFetch("https://loop.example.com/start")).rejects.toThrow(/too many redirects/);
  });
});

describe("safeFetch — response handling", () => {
  it("passes through status, text and retry-after", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Response("hello", { status: 401, headers: { "retry-after": "3" } }))
    );
    const res = await safeFetch("https://api.example.com/v1", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect(res.text).toBe("hello");
    expect(res.headers.get("retry-after")).toBe("3");
  });

  it("truncates oversized bodies at the byte cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Response("x".repeat(1000), { status: 200 }))
    );
    const res = await safeFetch("https://big.example.com/", { maxBytes: 100 });
    expect(res.truncated).toBe(true);
    expect(res.text.length).toBeLessThanOrEqual(200); // streamed truncation, chunk-boundary tolerance
  });

  it("rejects declared content-length above the cap before reading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Response("x".repeat(10), { status: 200, headers: { "content-length": "99999999" } }))
    );
    await expect(safeFetch("https://huge.example.com/", { maxBytes: 1000 })).rejects.toThrow(/response too large/);
  });

  it("maps timeouts to a SafeFetchError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const e = new Error("aborted");
              e.name = "AbortError";
              reject(e);
            });
          })
      )
    );
    await expect(safeFetch("https://slow.example.com/", { timeoutMs: 50 })).rejects.toThrow(/timed out/);
  });
});
