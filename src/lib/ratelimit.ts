import type Redis from "ioredis";

/**
 * Sliding-window rate limiter (US-007).
 *
 * With REDIS_URL the window lives in Redis, so limits are shared by every web
 * replica and survive restarts — brute-force protection holds when Banyan
 * scales. The check-and-record is one Lua script, so concurrent requests can
 * never both take the last slot.
 *
 * Without REDIS_URL, or if Redis errors, the per-process limiter below is
 * used. Requests are never unlimited: a Redis outage degrades protection to
 * per-process, it does not remove it (and does not lock everyone out).
 */

export type RateResult = { ok: boolean; retryAfterMs: number };

// ───────────── In-process limiter (fallback and tests) ─────────────
type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();

export function rateLimitMemory(key: string, limit: number, windowMs: number, now: number = Date.now()): RateResult {
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return { ok: false, retryAfterMs: windowMs - (now - bucket.hits[0]) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return { ok: true, retryAfterMs: 0 };
}

// ───────────── Redis limiter ─────────────
/**
 * KEYS[1] window key · ARGV: now, windowMs, limit, member
 * Returns {allowed (1|0), retryAfterMs}.
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = window
  if oldest[2] then retry = window - (now - tonumber(oldest[2])) end
  return {0, retry}
end
redis.call('ZADD', key, now, ARGV[4])
redis.call('PEXPIRE', key, window)
return {1, 0}
`;

let clientPromise: Promise<Redis> | null = null;

async function redisClient(): Promise<Redis> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { default: IORedis } = await import("ioredis");
      const { redisConnectionOptions } = await import("@/lib/queue/redis");
      // Fail fast: a slow or absent Redis must not hold a request hostage.
      return new IORedis({
        ...redisConnectionOptions(),
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        commandTimeout: 500,
        connectTimeout: 1_000,
      });
    })();
  }
  return clientPromise;
}

let warnedAt = 0;

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  if (!process.env.REDIS_URL) return rateLimitMemory(key, limit, windowMs);
  try {
    const redis = await redisClient();
    const now = Date.now();
    const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
    const [allowed, retry] = (await redis.eval(SLIDING_WINDOW_LUA, 1, `ratelimit:${key}`, now, windowMs, limit, member)) as [number, number];
    return allowed === 1 ? { ok: true, retryAfterMs: 0 } : { ok: false, retryAfterMs: Math.max(1, Number(retry)) };
  } catch (err) {
    if (Date.now() - warnedAt > 60_000) {
      warnedAt = Date.now();
      console.warn(`[ratelimit] Redis unavailable, using the per-process limiter: ${(err as Error).message}`);
    }
    return rateLimitMemory(key, limit, windowMs);
  }
}
