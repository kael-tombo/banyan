import { z } from "zod";
import { resolveDatabaseUrl } from "@/lib/db-url";
import { modelTiers } from "@/lib/agents/runtime/roster";

const hex64 = z.string().regex(/^[0-9a-fA-F]{64}$/, "APP_SECRET must be 64 hex chars (32 bytes)");

/** A model reference ("provider/model") or empty; mirrors roster.modelTiers' rule (ADR-007). */
const MODEL_REF = /^$|^[^/\s]+\/[^\s]+$/;
const AGENT_MODEL_MSG = (name: string) => `${name} must look like "provider/model" (e.g. anthropic/claude-sonnet-5-5), or be empty.`;

/**
 * Well-known development default for WORKER_SECRET. Production deployments
 * must override it: POST /api/worker/tick is Bearer-authenticated with this
 * value and can drive the orchestrator for every workspace.
 */
export const DEV_WORKER_SECRET = "banyan-worker-dev-secret";

const envSchema = z.object({
  DATABASE_URL: z.string({
    error:
      "Required — set DATABASE_URL (aliases accepted: PRISMA_DATABASE_URL, POSTGRES_URL)",
  }).min(1, "Required — set DATABASE_URL (aliases accepted: PRISMA_DATABASE_URL, POSTGRES_URL)"),
  APP_SECRET: hex64,
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  AI_PROVIDER: z.enum(["", "openai", "opencode", "none"]).default("none"),
  // Experimental, development-only brain: a local `opencode serve` instance
  // used when no OPENAI_API_KEY is set (see scripts/opencode-brain.mjs).
  // Ignored in production and whenever an API key is configured.
  OPENCODE_URL: z.string().default(""),
  OPENCODE_PASSWORD: z.string().default(""),
  OPENCODE_MODEL: z.string().default("opencode/deepseek-v4.1-flash-free"),
  OPENCODE_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(600_000).default(90_000),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  // Optional JSON object of extra HTTP headers merged into every request to
  // the OpenAI-compatible endpoint. Managed gateways that sit in front of a
  // model sometimes require routing or auth headers beyond the bearer token
  // (e.g. {"X-Z-AI-From":"Z","X-Token":"…"}). Invalid JSON is ignored — the
  // provider must never crash on misconfiguration; the fallback path exists.
  OPENAI_EXTRA_HEADERS: z.string().default(""),
  // Onboarding trend radar (docs/ONBOARDING_360.md). Each platform is read only
  // when its credentials are set; without them the radar links to the
  // platform's own search instead. All optional.
  // YouTube Data API v3 key (Google Cloud console; free quota 10,000 units/day).
  YOUTUBE_API_KEY: z.string().default(""),
  // Reddit "script" or "web" app (reddit.com/prefs/apps), app-only OAuth. Commercial
  // use needs Reddit's approval under its Data API terms.
  REDDIT_CLIENT_ID: z.string().default(""),
  REDDIT_CLIENT_SECRET: z.string().default(""),
  // A Bluesky account handle and an app password (Settings → App passwords).
  BLUESKY_HANDLE: z.string().default(""),
  BLUESKY_APP_PASSWORD: z.string().default(""),
  // US-010: transactional email over SMTP (any vendor: Resend, Postmark, Brevo…),
  // e.g. smtps://user:pass@smtp.resend.com:465. Empty: the dev transport writes
  // each email to the server log, labelled "not sent", and nothing is delivered.
  SMTP_URL: z.string().default(""),
  EMAIL_FROM: z.string().default("Banyan <no-reply@localhost>"),
  WORKER_SECRET: z.string().default(DEV_WORKER_SECRET),
  // Daily cap on live managed-model calls per workspace (quota applies to live
  // calls only; the labeled template fallback is never quota-limited). One
  // agentic run consumes one unit of the same quota (ADR-007).
  MODEL_MAX_CALLS_PER_DAY: z.coerce.number().int().min(1).max(1_000_000).default(500),
  // Agentic runtime selection (ADR-006/007). "direct" = one model call per
  // task (default, always available). "opencode" = the embedded OpenCode host
  // with tools and subagents; until roadmap R2 builds it, selection resolves
  // to "direct" with a labelled reason (src/lib/agents/runtime/select.ts).
  AGENT_RUNTIME: z.enum(["direct", "opencode"]).default("direct"),
  // Model tiers for the opencode runtime, each "provider/model". STRONG is
  // required when AGENT_RUNTIME=opencode; FAST and CRITIC fall back to STRONG.
  // In production CRITIC must differ from FAST (roster.modelTiers enforces it).
  AGENT_MODEL_STRONG: z.string().regex(MODEL_REF, AGENT_MODEL_MSG("AGENT_MODEL_STRONG")).default(""),
  AGENT_MODEL_FAST: z.string().regex(MODEL_REF, AGENT_MODEL_MSG("AGENT_MODEL_FAST")).default(""),
  AGENT_MODEL_CRITIC: z.string().regex(MODEL_REF, AGENT_MODEL_MSG("AGENT_MODEL_CRITIC")).default(""),
  // The opencode runtime's session store. One file per live worker process: two processes on one
  // file duplicate runs. Empty means .data/opencode-<hostname>.db; mount .data on a volume in Docker.
  AGENT_OPENCODE_DB: z.string().default(""),
  // Optional extra OpenCode providers as JSON, e.g. an OpenAI-compatible endpoint:
  // {"myco":{"package":"aisdk:@ai-sdk/openai-compatible","settings":{"baseURL":"https://…/v1"},"models":{"m":{}}}}
  // Keys never go here: OpenCode reads each provider's own environment variable.
  AGENT_OPENCODE_PROVIDERS: z
    .string()
    .default("")
    .refine((v) => {
      if (!v) return true;
      try {
        const parsed = JSON.parse(v);
        return typeof parsed === "object" && parsed !== null && !/"(apiKey|api_key|token|secret)"\s*:/i.test(v);
      } catch {
        return false;
      }
    }, "AGENT_OPENCODE_PROVIDERS must be a JSON object without keys in it (set the provider's own key variable instead)."),
  // Limits OpenCode does not enforce itself; the runtime interrupts the session past them.
  AGENT_RUN_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(1_800_000).default(240_000),
  AGENT_RUN_MAX_TOKENS: z.coerce.number().int().min(1_000).max(5_000_000).default(80_000),
  SEED_USER_EMAIL: z.string().default("founder@banyan.ai"),
  SEED_USER_PASSWORD: z.string().default("banyan-demopass"),
  // Sign-in providers (SSO). A provider is offered only when both its client
  // id and secret are set. See docs/SSO.md for redirect URIs and scopes.
  OAUTH_GOOGLE_CLIENT_ID: z.string().default(""),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().default(""),
  OAUTH_MICROSOFT_CLIENT_ID: z.string().default(""),
  OAUTH_MICROSOFT_CLIENT_SECRET: z.string().default(""),
  OAUTH_GITHUB_CLIENT_ID: z.string().default(""),
  OAUTH_GITHUB_CLIENT_SECRET: z.string().default(""),
  OAUTH_LINKEDIN_CLIENT_ID: z.string().default(""),
  OAUTH_LINKEDIN_CLIENT_SECRET: z.string().default(""),
  OAUTH_FACEBOOK_CLIENT_ID: z.string().default(""),
  OAUTH_FACEBOOK_CLIENT_SECRET: z.string().default(""),
  OAUTH_X_CLIENT_ID: z.string().default(""),
  OAUTH_X_CLIENT_SECRET: z.string().default(""),
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
  // ADR-007: the opencode runtime cannot boot without its strong tier. Only
  // enforced when that runtime is selected, so builds and direct-runtime
  // deployments stay green; also skipped during the build phase.
  if (data.AGENT_RUNTIME === "opencode" && !isBuildPhase && !data.AGENT_MODEL_STRONG) {
    throw new Error(
      'Invalid environment configuration — AGENT_MODEL_STRONG: required when AGENT_RUNTIME=opencode, as "provider/model" (FAST and CRITIC fall back to it).'
    );
  }
  // ADR-007 promises tier problems fail at boot, not mid-run. This is what keeps that promise.
  if (data.AGENT_RUNTIME === "opencode" && !isBuildPhase) {
    try {
      modelTiers(data, { production: data.NODE_ENV === "production" });
    } catch (err) {
      throw new Error(`Invalid environment configuration — ${(err as Error).message}`);
    }
  }
  return data;
}

export const env = readEnv();
export const isProd = env.NODE_ENV === "production";
