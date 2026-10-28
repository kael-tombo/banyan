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
 * - MIGRATE_ON_BUILD=strict    → deploy and FAIL the build if migrations
 *                                cannot be applied (the old default)
 * - anything else (postgres://)→ deploy; on failure print a loud warning and
 *                                CONTINUE the build (current default)
 *
 * Why warn-and-continue is the default: a failed build silently keeps the
 * PREVIOUS deployment live — the site then serves stale code with no signal
 * at all, which is far harder to diagnose than a degraded-but-current deploy
 * (this exact trap shipped a stale deploy on 2026-10-28: the fix sat unbuilt
 * while an old deployment kept returning 500s). A current deployment is
 * diagnosable via GET /api/health (db.reachable, db.schemaPresent); a stale
 * one is invisible.
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

const strict = process.env.MIGRATE_ON_BUILD === "strict";

console.log("[migrate-if-configured] deploying migrations to the configured database…");
try {
  // The Prisma CLI resolves env("DATABASE_URL") by the literal name; forward
  // the alias-resolved URL under the canonical name so the subprocess never
  // depends on which variable name the platform injected.
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
  console.log("[migrate-if-configured] migrations applied");
} catch {
  if (strict) {
    console.error(
      "[migrate-if-configured] migrate deploy FAILED (MIGRATE_ON_BUILD=strict) — failing the build"
    );
    process.exit(1);
  }
  console.error("==================================================================");
  console.error("[migrate-if-configured] migrate deploy FAILED — continuing the build");
  console.error("  This deployment ships WITHOUT applying pending migrations.");
  console.error("  After it goes live, verify:  curl <deploy-url>/api/health");
  console.error("    → check db.reachable and db.schemaPresent in the report");
  console.error("  Migrate out-of-band:         npx prisma migrate deploy");
  console.error("  Fail the build instead:      MIGRATE_ON_BUILD=strict");
  console.error("==================================================================");
  process.exit(0);
}
