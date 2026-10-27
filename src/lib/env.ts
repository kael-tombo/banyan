import { z } from "zod";

const hex64 = z.string().regex(/^[0-9a-fA-F]{64}$/, "APP_SECRET must be 64 hex chars (32 bytes)");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_SECRET: hex64,
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  AI_PROVIDER: z.enum(["", "openai", "none"]).default("none"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  WORKER_SECRET: z.string().default("banyan-worker-dev-secret"),
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
  return parsed.data;
}

export const env = readEnv();
export const isProd = env.NODE_ENV === "production";
