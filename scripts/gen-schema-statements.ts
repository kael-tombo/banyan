import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generates `src/lib/bootstrap/schema.generated.ts` — the committed Prisma
 * migration DDL embedded as an ordered statement array. The runtime
 * bootstrap (serverless demo provisioning) executes these statements via
 * Prisma raw queries, so no node builtins (fs/path) are needed inside the
 * application bundle and the edge-runtime compilation stays clean.
 *
 * Run `npm run gen:schema` after adding a migration. A drift check in
 * tests/runtime-bootstrap.test.ts fails if the generated file is stale.
 *
 * Statement splitting is safe for Prisma-generated SQLite DDL: it contains
 * no semicolons inside string literals or comments. Comment-only lines are
 * dropped before splitting.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repoRoot, "prisma", "migrations");
const outputFile = path.join(repoRoot, "src", "lib", "bootstrap", "schema.generated.ts");

export function collectStatements(dir: string = migrationsDir): string[] {
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(dir, d.name, "migration.sql"))
    .filter((f) => fs.existsSync(f))
    .sort(); // timestamp-prefixed directories — lexical sort is chronological

  if (files.length === 0) throw new Error(`no migration.sql files under ${dir}`);

  const statements: string[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const withoutComments = raw
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    for (const segment of withoutComments.split(";")) {
      const stmt = segment.trim();
      if (stmt.length > 0) statements.push(stmt);
    }
  }
  return statements;
}

async function main(): Promise<void> {
  const statements = collectStatements();
  const body = statements.map((s) => "  " + JSON.stringify(s) + ",").join("\n");
  const content = `// GENERATED FILE — do not edit. Run \`npm run gen:schema\` after adding a migration.
// Source of truth: prisma/migrations/*/migration.sql (ordered oldest first).
// A drift check in tests/runtime-bootstrap.test.ts fails if this file is stale.

export const MIGRATION_STATEMENTS: readonly string[] = [
${body}
];
`;
  fs.writeFileSync(outputFile, content);
  console.log(
    `[gen:schema] wrote ${statements.length} statements -> ${path.relative(repoRoot, outputFile)}`
  );
}

// Run when executed directly (tsx scripts/gen-schema-statements.ts); the
// drift test imports collectStatements() instead.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
