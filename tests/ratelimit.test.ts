import { describe, it, expect, afterEach } from "vitest";
import { rateLimit, rateLimitMemory } from "@/lib/ratelimit";

describe("rateLimit", () => {
  it("allows up to the limit then blocks with a retry hint", async () => {
    const key = `test-${Math.random()}`;
    expect((await rateLimit(key, 2, 1000)).ok).toBe(true);
    expect((await rateLimit(key, 2, 1000)).ok).toBe(true);
    const blocked = await rateLimit(key, 2, 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks buckets independently by key", async () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect((await rateLimit(a, 1, 1000)).ok).toBe(true);
    expect((await rateLimit(a, 1, 1000)).ok).toBe(false);
    expect((await rateLimit(b, 1, 1000)).ok).toBe(true);
  });
});

describe("rateLimitMemory sliding window", () => {
  it("frees a slot once the oldest hit leaves the window", () => {
    const key = `w-${Math.random()}`;
    expect(rateLimitMemory(key, 1, 1000, 10_000).ok).toBe(true);
    expect(rateLimitMemory(key, 1, 1000, 10_500)).toEqual({ ok: false, retryAfterMs: 500 });
    expect(rateLimitMemory(key, 1, 1000, 11_001).ok).toBe(true);
  });
});

describe("rateLimit when Redis is unreachable (US-007)", () => {
  const saved = process.env.REDIS_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = saved;
  });

  it("degrades to the per-process limiter instead of allowing unlimited requests", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:1/0"; // nothing listens on port 1
    const key = `down-${Math.random()}`;
    expect((await rateLimit(key, 1, 60_000)).ok).toBe(true);
    expect((await rateLimit(key, 1, 60_000)).ok).toBe(false);
  }, 10_000);
});
