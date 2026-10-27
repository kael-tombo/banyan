import "dotenv/config";

/**
 * Publishing worker — `npm run worker`.
 *
 * Polls the protected tick endpoint that attempts every due scheduled
 * publication. Kept as a thin HTTP client on purpose: the retry/idempotency
 * rules live in the publishing workflow (src/lib/publishing/publish.ts), so the
 * worker cannot drift from the server's behaviour. Safe to run alongside the
 * app; duplicate execution per publication is guarded server-side.
 *
 * Configure the target and cadence with NEXT_PUBLIC_APP_URL (or WORKER_BASE_URL)
 * and WORKER_INTERVAL_MS; authenticate with WORKER_SECRET.
 */
const base = (process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.WORKER_SECRET || "banyan-worker-dev-secret";
const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 60_000);

async function tick(): Promise<void> {
  try {
    const res = await fetch(`${base}/api/worker/tick`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    const body = (await res.json().catch(() => ({}))) as { attempted?: number; published?: number; failed?: number; error?: string };
    if (!res.ok) {
      console.error(`[worker] tick failed: HTTP ${res.status} ${body.error ?? ""}`.trim());
      return;
    }
    if (body.attempted) {
      console.log(`[worker] attempted=${body.attempted} published=${body.published} failed=${body.failed}`);
    }
  } catch (err) {
    console.error(`[worker] tick error: ${(err as Error).message}`);
  }
}

console.log(`[worker] polling ${base}/api/worker/tick every ${intervalMs}ms`);
void tick();
setInterval(() => void tick(), intervalMs);
