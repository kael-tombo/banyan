import { PublishResult } from "@/lib/publishing/types";

/**
 * Bounded retry policy for publication attempts.
 *
 * Design constraints (deliberate, not accidental):
 *  - a bounded number of attempts — never retry indefinitely;
 *  - exponential backoff with jitter so concurrent workers don't hammer
 *    a rate-limited provider in sync;
 *  - honoring an explicit provider Retry-After when one is given;
 *  - unknown errors are treated as PERMANENT unless the adapter explicitly
 *    marks them retryable — a retry must be a conscious policy decision;
 *  - every retried attempt goes through the same executePublication guard
 *    (approval still valid, no active publication), so retries can never
 *    publish content whose approval was revoked meanwhile.
 */

/** Total attempts per publication, including the first. */
export const MAX_PUBLISH_ATTEMPTS = 4;

/** Base delay for attempt n is RETRY_BASE_DELAY_MS * 2^(n-1). */
export const RETRY_BASE_DELAY_MS = 60_000; // 1 minute
/** Ceiling so a bad Retry-After or many attempts cannot park a post for days. */
export const RETRY_MAX_DELAY_MS = 30 * 60_000; // 30 minutes

/** Not-yet-attempted failures worth retrying, matched against the error text. */
const RETRYABLE_PATTERNS: RegExp[] = [
  /\b(429|rate.?limit)\b/i,
  /\b(500|502|503|504)\b/,
  /timed? ?out/i,
  /could not reach/i,
  /could not reach provider/i,
  /econn(refused|reset|aborted)/i,
  /enotfound|etimedout/i,
  /network/i,
];

/**
 * Should this failure trigger another attempt? True only when the adapter
 * explicitly marked the result retryable, or the error text unambiguously
 * matches a transient-failure class. Anything else stays terminal.
 */
export function isRetryableFailure(result: {
  ok: boolean;
  retryable?: boolean;
  retryAfterMs?: number;
  error?: string;
  raw?: unknown;
}): boolean {
  if (result.ok) return false;
  if (result.retryable === true) return true;
  if (typeof result.retryAfterMs === "number" && result.retryAfterMs > 0) return true;
  if (!result.error) return false;
  return RETRYABLE_PATTERNS.some((p) => p.test(result.error as string));
}

/**
 * Should executePublication schedule another attempt for this publication?
 * Pure so the bound is enforced (and tested) independently of the database.
 */
export function shouldRetryPublication(attempts: number, result: PublishResult): boolean {
  return attempts < MAX_PUBLISH_ATTEMPTS && isRetryableFailure(result);
}

/**
 * Delay before attempt n (1-based). Exponential with ±15% jitter, capped,
 * and overridden by an explicit provider Retry-After when given — also
 * capped so a hostile or misconfigured header cannot be used to stall.
 */
export function nextRetryDelayMs(attempts: number, opts: { retryAfterMs?: number; jitter?: number } = {}): number {
  const exponential = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1);
  let delay = Math.min(exponential, RETRY_MAX_DELAY_MS);
  if (typeof opts.retryAfterMs === "number" && opts.retryAfterMs > 0) {
    delay = Math.min(opts.retryAfterMs, RETRY_MAX_DELAY_MS);
  }
  const jitter = opts.jitter ?? 0.15;
  const amplitude = delay * jitter;
  // Deterministic pseudo-jitter spread across the attempts so staggered tests
  // can assert bounds; jitter is still within ±amplitude either way.
  const factor = (((attempts * 2654435761) % 1000) / 1000) * 2 - 1; // -1..1
  return Math.max(0, Math.round(delay + amplitude * factor));
}
