/**
 * Resolve the effective database URL from the environment.
 *
 * Prisma's canonical variable name is DATABASE_URL, but hosted-provider
 * integrations (Vercel marketplace, Prisma Postgres, common CI templates)
 * provision the same value under PRISMA_DATABASE_URL and POSTGRES_URL.
 * Accepting the well-known aliases means a deployment works with whatever
 * name the platform injected — precedence is deterministic:
 *
 *   DATABASE_URL  >  PRISMA_DATABASE_URL  >  POSTGRES_URL
 *
 * This module is intentionally dependency-free (no env.ts, no Prisma client)
 * so it can be imported by the build-time migration script, the runtime
 * validator, and the diagnostics health route without triggering any module
 * side effects.
 */
export type DatabaseUrlSource = "DATABASE_URL" | "PRISMA_DATABASE_URL" | "POSTGRES_URL" | "none";

const CANDIDATES = ["DATABASE_URL", "PRISMA_DATABASE_URL", "POSTGRES_URL"] as const;

export function resolveDatabaseUrl(
  source: Record<string, string | undefined> = process.env
): { url: string; via: Exclude<DatabaseUrlSource, "none"> } | { url: undefined; via: "none" } {
  for (const name of CANDIDATES) {
    const value = source[name]?.trim();
    if (value) return { url: value, via: name };
  }
  return { url: undefined, via: "none" };
}

/**
 * Strip anything secret-looking from an error message before it is surfaced
 * by the diagnostics endpoint: the full resolved URL and any userinfo
 * password embedded in a URL-shaped string are redacted.
 */
export function redactDatabaseSecrets(message: string, resolvedUrl?: string): string {
  let out = message;
  if (resolvedUrl) out = out.split(resolvedUrl).join("<redacted-url>");
  // postgres://user:password@host — redact the password segment wherever it appears
  out = out.replace(/(:\/\/[^:/\s]+:)([^@\s]+)(@)/g, "$1<redacted>$3");
  return out;
}
