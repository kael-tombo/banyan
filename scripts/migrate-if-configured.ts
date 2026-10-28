import "dotenv/config";
import { execSync } from "node:child_process";

/**
 * Runs `prisma migrate deploy` during the build when a real hosted database
 * is configured; skips cleanly on machines without one (local placeholder
 * builds, clean-room builds, CI without a database service).
 *
 * - No DATABASE_URL            → skip (nothing to migrate)
 * - file: URL                  → skip (SQLite is no longer a supported
 *                                provider; file URLs during build are the
 *                                build-phase placeholders from src/lib/env.ts)
 * - MIGRATE_ON_BUILD=0         → skip (explicit kill-switch; run
 *                                `npx prisma migrate deploy` out-of-band)
 * - anything else (postgres://) → deploy (idempotent; fails the build loudly
 *                                if the database is unreachable — that is
 *                                signal, not noise)
 */
const url = process.env.DATABASE_URL ?? "";

if (!url) {
  console.log("[migrate-if-configured] DATABASE_URL not set — skipping migrate deploy");
  process.exit(0);
}

if (url.startsWith("file:")) {
  console.log("[migrate-if-configured] file: URL (build placeholder) — skipping migrate deploy");
  process.exit(0);
}

if (process.env.MIGRATE_ON_BUILD === "0") {
  console.log("[migrate-if-configured] MIGRATE_ON_BUILD=0 — skipping migrate deploy");
  process.exit(0);
}

console.log("[migrate-if-configured] deploying migrations to the configured database…");
try {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  console.log("[migrate-if-configured] migrations applied");
} catch (err) {
  console.error("[migrate-if-configured] migrate deploy FAILED — fix the database or set MIGRATE_ON_BUILD=0");
  process.exit(1);
}
