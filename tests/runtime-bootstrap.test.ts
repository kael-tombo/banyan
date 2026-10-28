import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Pure-logic coverage for the runtime bootstrap (serverless demo
 * provisioning). Database-touching behavior is verified by a live
 * production-server simulation (runbook §4), not here — unit tests never
 * touch the database.
 */
const REAL_ENV = process.env;

afterEach(() => {
  process.env = REAL_ENV;
  vi.resetModules();
});

describe("schema.generated (embedded migration DDL)", () => {
  it("matches the committed migrations — drift fails the suite", async () => {
    const { collectStatements } = await import("../scripts/gen-schema-statements");
    const { MIGRATION_STATEMENTS } = await import("@/lib/bootstrap/schema.generated");
    const live = collectStatements() as string[];
    expect(MIGRATION_STATEMENTS.length).toBeGreaterThan(0);
    expect([...MIGRATION_STATEMENTS]).toEqual(live);
    console.log(
      `[runtime-bootstrap] drift check passed (${MIGRATION_STATEMENTS.length} embedded statements)`
    );
  });

  it("contains core table creation and is ordered oldest-first", async () => {
    const { MIGRATION_STATEMENTS } = await import("@/lib/bootstrap/schema.generated");
    const first = MIGRATION_STATEMENTS[0];
    expect(first).toMatch(/^CREATE TABLE "User"/);
    expect(MIGRATION_STATEMENTS.join("\n")).toContain('CREATE TABLE "Workspace"');
  });

  it("collector splits a synthetic migration file correctly", async () => {
    const { collectStatements } = await import("../scripts/gen-schema-statements");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"));
    const migrationDir = path.join(dir, "20260101000000_test");
    fs.mkdirSync(migrationDir);
    fs.writeFileSync(
      path.join(migrationDir, "migration.sql"),
      [
        "-- CreateTable",
        'CREATE TABLE "Widget" (',
        '    "id" TEXT NOT NULL PRIMARY KEY,',
        '    "note" TEXT NOT NULL DEFAULT \'hello\'',
        ");",
        "",
        "-- AddTimestamps",
        'ALTER TABLE "Widget" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;',
      ].join("\n")
    );
    const statements = collectStatements(dir) as string[];
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('CREATE TABLE "Widget"');
    expect(statements[1]).toContain("ALTER TABLE");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("ensureDatabaseReady (decision logic, no database access)", () => {
  it("skips when RUNTIME_DB_BOOTSTRAP=0, before touching anything", async () => {
    process.env = { ...REAL_ENV, RUNTIME_DB_BOOTSTRAP: "0", DATABASE_URL: "file:./whatever.db" };
    const { ensureDatabaseReady } = await import("@/lib/bootstrap/runtime-bootstrap");
    await expect(ensureDatabaseReady()).resolves.toBe("skipped");
  });

  it("skips non-SQLite databases — hosted databases are provisioned externally", async () => {
    process.env = { ...REAL_ENV, DATABASE_URL: "postgresql://user:pass@host:5432/db" };
    const { ensureDatabaseReady } = await import("@/lib/bootstrap/runtime-bootstrap");
    await expect(ensureDatabaseReady()).resolves.toBe("skipped");
  });
});
