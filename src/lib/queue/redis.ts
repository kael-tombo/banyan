import type { RedisOptions } from "ioredis";

/**
 * Redis connection settings shared by the queue and the rate limiter.
 * BullMQ workers need `maxRetriesPerRequest: null` so blocking commands are
 * not aborted while Redis restarts.
 */
export function redisConnectionOptions(): RedisOptions {
  const raw = process.env.REDIS_URL;
  if (!raw) throw new Error("REDIS_URL is not configured");
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
}
