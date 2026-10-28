import { z } from "zod";

const hex64 = z.string().regex(/^[0-9a-fA-F]{64}$/, "APP_SECRET must be 64 hex chars (32 bytes)");

/**
 * Well-known development default for WORKER_SECRET. Production deployments
 * must override it: POST /api/worker/tick is Bearer-authenticated with this
 * value and can drive the orchestrator for every workspace.
 */
export const DEV_WORKER_SECRET = "banyan-worker-dev-secret";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_SECRET: hex64,
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  AI_PROVIDER: z.enum(["", "openai", "none"]).default("none"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  WORKER_SECRET: z.string().default(DEV_WORKER_SECRET),
  // Daily cap on live managed-model calls per workspace (quota applies to live
  // calls only; the labeled template fallback is never quota-limited).
  MODEL_MAX_CALLS_PER_DAY: z.coerce.number().int().min(1).max(1_000_000).default(500),
  SEED_USER_EMAIL: z.string().default("founder@banyan.ai"),
  SEED_USER_PASSWORD: z.string().default("banyan-demopass"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

function readEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  const data = parsed.data;
  if (data.NODE_ENV === "production" && (!data.WORKER_SECRET || data.WORKER_SECRET === DEV_WORKER_SECRET)) {
    throw new Error(
      "Invalid environment configuration — WORKER_SECRET: set a strong unique value in production (it guards POST /api/worker/tick); the development default and empty values are not allowed."
    );
  }
  return data;
}

export const env = readEnv();
export const isProd = env.NODE_ENV === "production";
