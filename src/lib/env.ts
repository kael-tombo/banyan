import { z } from "zod";
import { resolveDatabaseUrl } from "@/lib/db-url";

const hex64 = z.string().regex(/^[0-9a-fA-F]{64}$/, "APP_SECRET must be 64 hex chars (32 bytes)");

/**
 * Well-known development default for WORKER_SECRET. Production deployments
 * must override it: POST /api/worker/tick is Bearer-authenticated with this
 * value and can drive the orchestrator for every workspace.
 */
export const DEV_WORKER_SECRET = "banyan-worker-dev-secret";

const envSchema = z.object({
  DATABASE_URL: z.string({
    required_error:
      "Required — set DATABASE_URL (aliases accepted: PRISMA_DATABASE_URL, POSTGRES_URL)",
  }).min(1, "Required — set DATABASE_URL (aliases accepted: PRISMA_DATABASE_URL, POSTGRES_URL)"),
  APP_SECRET: hex64,
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  AI_PROVIDER: z.enum(["", "openai", "none"]).default("none"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  // Optional JSON object of extra HTTP headers merged into every request to
  // the OpenAI-compatible endpoint. Managed gateways that sit in front of a
  // model sometimes require routing or auth headers beyond the bearer token
  // (e.g. {"X-Z-AI-From":"Z","X-Token":"…"}). Invalid JSON is ignored — the
  // provider must never crash on misconfiguration; the fallback path exists.
  OPENAI_EXTRA_HEADERS: z.string().default(""),
  WORKER_SECRET: z.string().default(DEV_WORKER_SECRET),
  // Daily cap on live managed-model calls per workspace (quota applies to live
  // calls only; the labeled template fallback is never quota-limited).
  MODEL_MAX_CALLS_PER_DAY: z.coerce.number().int().min(1).max(1_000_000).default(500),
  SEED_USER_EMAIL: z.string().default("founder@banyan.ai"),
  SEED_USER_PASSWORD: z.string().default("banyan-demopass"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

function readEnv() {
  // `next build` collects page data on CI/build machines that are not the
  // runtime host — runtime-only secrets cannot be required there. Build
  // machines (Vercel, Docker builder, CI) evaluate every page module, which
  // executes this module-level validator without any project secrets. Fill
  // required values with inert placeholders for that phase only: no build-
  // time code path queries the database or derives real keys from APP_SECRET.
  // Real production runtime (`next start` / serverless invocation) never has
  // NEXT_PHASE set, so it still fails fast below until real values exist.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  const source: Record<string, string | undefined> = { ...process.env };
  // Hosted-provider integrations inject the database URL under well-known
  // alias names (PRISMA_DATABASE_URL, POSTGRES_URL). Normalize onto the
  // canonical name so the rest of the validator (and the app) reads one field.
  source.DATABASE_URL = resolveDatabaseUrl(source).url;
  if (isBuildPhase) {
    source.DATABASE_URL ||= "file:./build-placeholder.db";
    source.APP_SECRET ||= "0".repeat(64); // schema-valid hex; never used for real work at build time
  }
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  const data = parsed.data;
  if (
    data.NODE_ENV === "production" &&
    !isBuildPhase &&
    (!data.WORKER_SECRET || data.WORKER_SECRET === DEV_WORKER_SECRET)
  ) {
    throw new Error(
      "Invalid environment configuration — WORKER_SECRET: set a strong unique value in production (it guards POST /api/worker/tick); the development default and empty values are not allowed."
    );
  }
  return data;
}

export const env = readEnv();
export const isProd = env.NODE_ENV === "production";
