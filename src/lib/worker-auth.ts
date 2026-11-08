import { timingSafeEqual } from "node:crypto";

/**
 * Who may run the maintenance tick (POST or GET /api/worker/tick).
 *
 * - `Bearer <WORKER_SECRET>`: the worker's HTTP fallback, or any external scheduler.
 * - `Bearer <CRON_SECRET>`: Vercel Cron, which sends GET requests with exactly this header when the project has
 *   a CRON_SECRET environment variable. Only accepted when CRON_SECRET is set and at least 16 characters long.
 *
 * Compared in constant time, so the response time does not leak how much of a secret matched.
 */
export function tickAuthorized(header: string | null, secrets: { workerSecret: string; cronSecret?: string | null }): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const given = header.slice("Bearer ".length);
  const accepted = [secrets.workerSecret, secrets.cronSecret && secrets.cronSecret.length >= 16 ? secrets.cronSecret : null];
  return accepted.some((s) => !!s && sameSecret(given, s));
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
