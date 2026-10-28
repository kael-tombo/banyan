import { prisma } from "@/lib/db";
import { MIGRATION_STATEMENTS } from "./schema.generated";
import { seedDemoDatabase } from "./seed-demo";

/**
 * Runtime database bootstrap for throwaway-filesystem hosts (serverless).
 *
 * On Vercel (and similar), the runtime instance starts with an empty
 * filesystem: `prisma migrate deploy` and `db:seed` can only have ever run
 * on the build machine, whose disk is not shipped to serverless instances.
 * Without this, every request that touches the database fails and the demo
 * account (`founder@banyan.ai`) cannot exist — the login screen is a dead end.
 *
 * What this does, idempotently and only for SQLite databases:
 *   1. If the schema is missing → apply the committed migration DDL
 *      (embedded at build time via `npm run gen:schema` — no fs in the bundle).
 *   2. If no user exists → run the shared demo seed (`seed-demo.ts`).
 *   3. Otherwise → no-op.
 *
 * It is a demo-provisioning path, not a migration system: on a durable host
 * you keep using `npm run setup` / the Docker entrypoint (which handle
 * incremental migrations). Set `RUNTIME_DB_BOOTSTRAP=0` to disable.
 */
export type BootstrapResult = "bootstrapped" | "ready" | "skipped";

async function applySchemaStatements(): Promise<void> {
  let applied = 0;
  for (const stmt of MIGRATION_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      applied += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Concurrent cold starts of the same serverless instance group can race
      // on schema creation — "already exists" means the other instance won.
      if (/already exists/i.test(msg)) continue;
      throw err;
    }
  }
  console.log(`[bootstrap] schema applied (${applied}/${MIGRATION_STATEMENTS.length} statements)`);
}

export async function ensureDatabaseReady(): Promise<BootstrapResult> {
  if (process.env.RUNTIME_DB_BOOTSTRAP === "0") return "skipped";
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) {
    // Hosted databases (Postgres etc.) are provisioned externally — nothing
    // to do here, and touching them automatically would be surprising.
    return "skipped";
  }

  let schemaReady = false;
  try {
    await prisma.user.count();
    schemaReady = true; // core table exists and is queryable
  } catch {
    schemaReady = false; // fresh/empty file or missing tables
  }

  if (!schemaReady) await applySchemaStatements();

  // Seeding is idempotent (upserts + cleared demo workspace); it heals a
  // database that has schema but lost its demo account.
  try {
    const users = await prisma.user.count();
    if (users > 0) return "ready";
  } catch {
    // fall through to seeding — applySchemaStatements above guarantees the
    // table exists, so a throw here is a real problem and rethrows below.
  }
  await seedDemoDatabase(prisma);
  return "bootstrapped";
}

let bootstrapPromise: Promise<BootstrapResult> | null = null;

/**
 * Once-per-process wrapper. Concurrent requests share one bootstrap run; a
 * failed run clears the cache so the next request can retry.
 */
export function ensureDatabaseReadyOnce(): Promise<BootstrapResult> {
  if (!bootstrapPromise) {
    bootstrapPromise = ensureDatabaseReady().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

/** Used by tests to reset the once-per-process cache. */
export function resetBootstrapCacheForTests(): void {
  bootstrapPromise = null;
}
