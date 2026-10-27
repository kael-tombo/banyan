import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/ratelimit";

describe("rateLimit", () => {
  it("allows up to the limit then blocks with a retry hint", () => {
    const key = `test-${Math.random()}`;
    expect(rateLimit(key, 2, 1000).ok).toBe(true);
    expect(rateLimit(key, 2, 1000).ok).toBe(true);
    const blocked = rateLimit(key, 2, 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks buckets independently by key", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(rateLimit(a, 1, 1000).ok).toBe(true);
    expect(rateLimit(a, 1, 1000).ok).toBe(false);
    expect(rateLimit(b, 1, 1000).ok).toBe(true);
  });
});
