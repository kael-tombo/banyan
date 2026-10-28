import { describe, expect, it } from "vitest";
import { redactDatabaseSecrets, resolveDatabaseUrl } from "@/lib/db-url";

/**
 * The resolver is the single source of truth for "which database URL does the
 * app run on". Deployments arrive with the value under different names
 * depending on the platform integration, so the alias chain and its
 * deterministic precedence are pinned here.
 */
describe("resolveDatabaseUrl", () => {
  it("returns the DATABASE_URL when the canonical name is set", () => {
    const r = resolveDatabaseUrl({ DATABASE_URL: "postgres://a@h/db" });
    expect(r).toEqual({ url: "postgres://a@h/db", via: "DATABASE_URL" });
  });

  it("falls back to PRISMA_DATABASE_URL, then POSTGRES_URL", () => {
    expect(resolveDatabaseUrl({ PRISMA_DATABASE_URL: "postgres://a@h/db" })).toEqual({
      url: "postgres://a@h/db",
      via: "PRISMA_DATABASE_URL",
    });
    expect(resolveDatabaseUrl({ POSTGRES_URL: "postgres://a@h/db" })).toEqual({
      url: "postgres://a@h/db",
      via: "POSTGRES_URL",
    });
  });

  it("prefers DATABASE_URL over both aliases, and PRISMA_DATABASE_URL over POSTGRES_URL", () => {
    const all = {
      DATABASE_URL: "postgres://canonical@h/db",
      PRISMA_DATABASE_URL: "postgres://alias@h/db",
      POSTGRES_URL: "postgres://fallback@h/db",
    };
    expect(resolveDatabaseUrl(all).via).toBe("DATABASE_URL");
    expect(resolveDatabaseUrl({ PRISMA_DATABASE_URL: "postgres://alias@h/db", POSTGRES_URL: "postgres://fallback@h/db" }).via).toBe(
      "PRISMA_DATABASE_URL"
    );
  });

  it("ignores blank/whitespace values and reports none when nothing is set", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "   ", PRISMA_DATABASE_URL: "", POSTGRES_URL: undefined })).toEqual({
      url: undefined,
      via: "none",
    });
    expect(resolveDatabaseUrl({})).toEqual({ url: undefined, via: "none" });
  });

  it("trims surrounding whitespace from alias values", () => {
    expect(resolveDatabaseUrl({ POSTGRES_URL: "  postgres://a@h/db  " })).toEqual({
      url: "postgres://a@h/db",
      via: "POSTGRES_URL",
    });
  });
});

describe("redactDatabaseSecrets", () => {
  it("redacts the password segment of any URL-shaped string in an error", () => {
    const msg = 'Authentication failed against database server at db.prisma.io:5432 for user "2477fca0": error from postgres://user:sk_DG9Z-9nsjeRUdVV_HDPA1@db.prisma.io:5432';
    const out = redactDatabaseSecrets(msg);
    expect(out).not.toContain("sk_DG9Z");
    expect(out).toContain("<redacted>");
  });

  it("redacts the full resolved URL if it appears verbatim", () => {
    const url = "postgres://user:sk_secret@db.prisma.io:5432/postgres?sslmode=require";
    const out = redactDatabaseSecrets(`bad config: ${url}`, url);
    expect(out).not.toContain("sk_secret");
    expect(out).toContain("<redacted-url>");
  });

  it("leaves messages without URL-shaped secrets untouched", () => {
    expect(redactDatabaseSecrets("Can't reach database server at db.prisma.io:5432")).toBe(
      "Can't reach database server at db.prisma.io:5432"
    );
  });
});
