import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { redactDatabaseSecrets, resolveDatabaseUrl, type DatabaseUrlSource } from "@/lib/db-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEV_WORKER_SECRET = "banyan-worker-dev-secret";

type HealthReport = {
  service: string;
  env: {
    databaseUrlConfigured: boolean;
    databaseUrlSource: DatabaseUrlSource;
    appSecretConfigured: boolean;
    workerSecretProductionSafe: boolean;
    nodeEnv: string | null;
    validated?: boolean;
    validationError?: string;
  };
  db: {
    reachable: boolean;
    schemaPresent: boolean;
    demoUserPresent: boolean;
    latencyMs: number | null;
    userCount?: number;
    error?: string;
  };
};

/**
 * Deployment diagnostics: one GET that answers "why can't I authenticate?"
 * without shell access to the serverless host.
 *
 * Deliberately built WITHOUT static imports of @/lib/env, @/lib/db or
 * @/lib/api-utils: when the environment is misconfigured those modules throw
 * at import time (fail-fast by design), which would turn this route into the
 * very 500 it exists to diagnose. Everything heavy is dynamically imported
 * inside try/catch so the report degrades gracefully.
 *
 * Safe to expose: booleans, labels and latency only — no secret values. Any
 * database error text is scrubbed through redactDatabaseSecrets() before it
 * leaves the process.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limited = await rateLimit(`health:${ip}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "retry-after-ms": String(limited.retryAfterMs) } }
    );
  }

  const resolved = resolveDatabaseUrl();
  const report: HealthReport = {
    service: "banyan",
    env: {
      databaseUrlConfigured: Boolean(resolved.url),
      databaseUrlSource: resolved.via,
      appSecretConfigured: /^[0-9a-fA-F]{64}$/.test(process.env.APP_SECRET ?? ""),
      workerSecretProductionSafe:
        Boolean(process.env.WORKER_SECRET) && process.env.WORKER_SECRET !== DEV_WORKER_SECRET,
      nodeEnv: process.env.NODE_ENV ?? null,
    },
    db: { reachable: false, schemaPresent: false, demoUserPresent: false, latencyMs: null as number | null },
  };

  // Full env validation — catches APP_SECRET format and the production
  // WORKER_SECRET rules. The thrown message describes issues without
  // echoing secret values.
  try {
    await import("@/lib/env");
    report.env.validated = true;
  } catch (err) {
    report.env.validated = false;
    report.env.validationError = err instanceof Error ? err.message : String(err);
  }

  // Database probe — independent of validation success so a partially
  // configured deployment still shows how far it gets.
  if (resolved.url) {
    const started = Date.now();
    try {
      const { prisma } = await import("@/lib/db");
      await prisma.$queryRaw`SELECT 1`;
      report.db.reachable = true;
      report.db.latencyMs = Date.now() - started;
      try {
        report.db.userCount = await prisma.user.count();
        report.db.schemaPresent = true;
        const founder = await prisma.user.findUnique({
          where: { email: process.env.SEED_USER_EMAIL || "founder@banyan.ai" },
          select: { id: true },
        });
        report.db.demoUserPresent = Boolean(founder);
      } catch {
        // Reachable but the schema is missing → migrations were never applied.
        report.db.schemaPresent = false;
      }
    } catch (err) {
      report.db.error = redactDatabaseSecrets(err instanceof Error ? err.message : String(err), resolved.url);
    }
  }

  const healthy = report.env.validated === true && report.db.reachable === true;
  return NextResponse.json(
    { ok: healthy, ...report },
    { status: healthy ? 200 : 503 }
  );
}
