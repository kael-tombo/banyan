import "dotenv/config";
import { execSync } from "node:child_process";
import { resolveDatabaseUrl } from "../src/lib/db-url";

/**
 * Runs `prisma migrate deploy` during the build when a real hosted database
 * is configured; skips cleanly on machines without one (local placeholder
 * builds, clean-room builds, CI without a database service).
 *
 * - No database URL            → skip (nothing to migrate). Resolved via the
 *                                same alias chain as src/lib/env.ts:
 *                                DATABASE_URL > PRISMA_DATABASE_URL > POSTGRES_URL
 * - file: URL                  → skip (SQLite is no longer a supported
 *                                provider; file URLs during build are the
 *                                build-phase placeholders from src/lib/env.ts)
 * - MIGRATE_ON_BUILD=0         → skip (explicit kill-switch; run
 *                                `npx prisma migrate deploy` out-of-band)
 * - anything else (postgres://) → deploy (idempotent; fails the build loudly
 *                                if the database is unreachable — that is
 *                                signal, not noise)
 */
const resolved = resolveDatabaseUrl();
const url = resolved.url ?? "";

if (!url) {
  console.log(
    "[migrate-if-configured] no database URL configured (DATABASE_URL / PRISMA_DATABASE_URL / POSTGRES_URL) — skipping migrate deploy"
  );
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
  // The Prisma CLI resolves env("DATABASE_URL") by the literal name; forward
  // the alias-resolved URL under the canonical name so the subprocess never
  // depends on which variable name the platform injected.
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
  console.log("[migrate-if-configured] migrations applied");
} catch (err) {
  console.error("[migrate-if-configured] migrate deploy FAILED — fix the database or set MIGRATE_ON_BUILD=0");
  process.exit(1);
}
