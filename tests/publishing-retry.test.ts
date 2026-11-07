import { describe, it, expect } from "vitest";
import {
  isRetryableFailure,
  shouldRetryPublication,
  nextRetryDelayMs,
  MAX_PUBLISH_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} from "@/lib/publishing/retry";
import type { PublishResult } from "@/lib/publishing/types";

const failed = (extras: Partial<PublishResult>): PublishResult => ({ ok: false, raw: {}, ...extras });

describe("isRetryableFailure", () => {
  it("never retries a successful result", () => {
    expect(isRetryableFailure({ ok: true, retryable: true, raw: {} })).toBe(false);
  });

  it("trusts the adapter's explicit retryable flag", () => {
    expect(isRetryableFailure(failed({ error: "Provider responded 400: bad payload", retryable: true }))).toBe(true);
  });

  it("treats network failures, timeouts and rate limits as transient", () => {
    expect(isRetryableFailure(failed({ error: "Provider request timed out." }))).toBe(true);
    expect(isRetryableFailure(failed({ error: "Provider responded 429: rate limit exceeded" }))).toBe(true);
    expect(isRetryableFailure(failed({ error: "Provider responded 503: service unavailable" }))).toBe(true);
    expect(isRetryableFailure(failed({ error: "Could not reach provider: ECONNREFUSED" }))).toBe(true);
  });

  it("treats validation and auth errors as permanent", () => {
    expect(isRetryableFailure(failed({ error: "Provider responded 401: unauthorized" }))).toBe(false);
    expect(isRetryableFailure(failed({ error: "Provider responded 422: validation failed" }))).toBe(false);
    expect(isRetryableFailure(failed({}))).toBe(false);
  });

  it("treats an explicit provider Retry-After as retryable even without flags", () => {
    expect(isRetryableFailure(failed({ error: "Provider said slow down", retryAfterMs: 5_000 }))).toBe(true);
  });
});

describe("shouldRetryPublication", () => {
  it("stops retrying once the attempt cap is reached", () => {
    expect(MAX_PUBLISH_ATTEMPTS).toBeGreaterThanOrEqual(2);
    expect(shouldRetryPublication(MAX_PUBLISH_ATTEMPTS - 1, failed({ retryable: true }))).toBe(true);
    expect(shouldRetryPublication(MAX_PUBLISH_ATTEMPTS, failed({ retryable: true }))).toBe(false);
    expect(shouldRetryPublication(MAX_PUBLISH_ATTEMPTS + 10, failed({ retryable: true }))).toBe(false);
  });

  it("uses the transient-error classification for its bound", () => {
    expect(shouldRetryPublication(0, failed({ error: "422 validation" }))).toBe(false);
    expect(shouldRetryPublication(0, failed({ error: "504 gateway timeout" }))).toBe(true);
  });
});

describe("nextRetryDelayMs", () => {
  it("grows exponentially from one minute", () => {
    expect(nextRetryDelayMs(1, { jitter: 0 })).toBe(RETRY_BASE_DELAY_MS);
    expect(nextRetryDelayMs(2, { jitter: 0 })).toBe(RETRY_BASE_DELAY_MS * 2);
    expect(nextRetryDelayMs(3, { jitter: 0 })).toBe(RETRY_BASE_DELAY_MS * 4);
  });

  it("caps the exponential growth", () => {
    expect(nextRetryDelayMs(20, { jitter: 0 })).toBe(RETRY_MAX_DELAY_MS);
    expect(RETRY_MAX_DELAY_MS).toBeLessThanOrEqual(RETRY_BASE_DELAY_MS * 32);
  });

  it("honours a preceding provider Retry-After", () => {
    expect(nextRetryDelayMs(1, { jitter: 0, retryAfterMs: 10_000 })).toBe(10_000);
  });

  it("caps a hostile or huge provider Retry-After", () => {
    expect(nextRetryDelayMs(1, { jitter: 0, retryAfterMs: 7 * 24 * 60 * 60 * 1000 })).toBe(RETRY_MAX_DELAY_MS);
  });

  it("applies bounded jitter either way", () => {
    for (let n = 1; n <= 5; n++) {
      const delay = nextRetryDelayMs(n);
      const base = nextRetryDelayMs(n, { jitter: 0 });
      expect(delay).toBeGreaterThan(base * 0.84);
      expect(delay).toBeLessThanOrEqual(base * 1.16);
    }
  });
});
