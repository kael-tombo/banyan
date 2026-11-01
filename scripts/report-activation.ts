/**
 * US-058 — activation and time-to-value report for the operator.
 *
 *   npm run report:activation              funnel summary + per-workspace §11 checks
 *   npm run report:activation -- --json    the same, as JSON
 *   npm run report:activation -- --include-self   also count Banyan's own workspace
 *
 * Read-only. Every figure comes from existing rows (src/lib/activation-data.ts).
 */
import { prisma } from "@/lib/db";
import { loadActivation } from "@/lib/activation-data";
import { summarise } from "@/lib/activation";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const includeSelf = args.includes("--include-self");

const MARK = { pass: "PASS", fail: "FAIL", pending: "....", not_measured: " n/a" } as const;
const fmt = (v: number | null, unit: string) => (v === null ? "—" : `${v} ${unit}`);

async function main() {
  const all = await loadActivation();
  const rows = includeSelf ? all : all.filter((r) => !r.isSelf);
  const summary = summarise(rows);

  if (asJson) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), includeSelf, summary, workspaces: rows }, null, 2));
    return;
  }

  console.log(`Activation funnel — ${summary.workspaces} workspace(s)${includeSelf ? " incl. Banyan's own" : ""}\n`);
  for (const s of summary.stages) {
    console.log(`  ${s.label.padEnd(40)} ${String(s.reached).padStart(4)}  ${String(s.percent).padStart(5)}%`);
  }
  console.log(`\n  Primary activation (provider-confirmed publication): ${summary.primaryActivationPercent}%`);
  console.log(`  First publication, any path:                          ${summary.anyPathPublicationPercent}%`);
  console.log(`  Median time to first approved asset:                  ${fmt(summary.medianHoursToFirstApprovedAsset, "h")}`);
  console.log(`  Median time to first publication:                     ${fmt(summary.medianHoursToFirstPublication, "h")}`);
  console.log(`  Founder active time:                                  not measured (no source records it)\n`);

  for (const r of rows) {
    console.log(`${r.name} (${r.workspaceId}) — ${r.reached}/${r.milestones.length} milestones`);
    for (const c of r.checks) console.log(`  [${MARK[c.result]}] ${c.label} (${c.threshold}): ${c.detail}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
