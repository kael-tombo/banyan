/**
 * Next.js instrumentation — `register()` runs once when the server starts
 * (including every serverless cold start, before requests are served).
 *
 * On hosts with a throwaway filesystem (Vercel), the SQLite database does
 * not exist on a fresh instance and no migrate/seed step has ever run there.
 * The bootstrap provisions the demo schema + seed account so the deployed
 * app is usable immediately. On durable hosts (Node/Docker) the database
 * already exists and this is a cheap no-op probe.
 *
 * Failures are logged, not thrown: a broken database should surface as a
 * clean runtime error on the affected request, not crash server startup.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureDatabaseReadyOnce } = await import("@/lib/bootstrap/runtime-bootstrap");
  try {
    const result = await ensureDatabaseReadyOnce();
    if (result === "bootstrapped") {
      console.log("[bootstrap] demo database provisioned at runtime (schema + seed)");
    }
  } catch (err) {
    console.error("[bootstrap] database bootstrap failed:", err);
  }
}
