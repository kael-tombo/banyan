/**
 * Minimal in-process sliding-window rate limiter.
 * Suitable for a single-node MVP; for multi-node deployments replace with a
 * shared store (e.g. Redis). Clear limitation, documented in README.
 */
type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0];
    return { ok: false, retryAfterMs: windowMs - (now - oldest) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 10_000) {
    // crude sweep to avoid unbounded growth
    for (const [k, b] of buckets) {
      if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return { ok: true, retryAfterMs: 0 };
}
