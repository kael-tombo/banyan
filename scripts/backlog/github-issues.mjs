// Import-ready GitHub issue backlog for the Banyan MVP.
//
//   node scripts/backlog/github-issues.mjs                 # dry run: prints what would be created
//   node scripts/backlog/github-issues.mjs --create        # creates labels, milestones and issues with `gh`
//   node scripts/backlog/github-issues.mjs --create --repo owner/name
//
// Idempotent: an issue whose title starts with the story id is never created twice.
// Done stories are skipped (already delivered). Requires an authenticated `gh` CLI.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { stories } = JSON.parse(readFileSync(join(root, "docs", "user-stories.json"), "utf8"));
const create = process.argv.includes("--create");
const repoIdx = process.argv.indexOf("--repo");
const repo = repoIdx > -1 ? process.argv[repoIdx + 1] : "kael-tombo/banyan";
const gh = (args) => execFileSync("gh", [...args, "--repo", repo], { encoding: "utf8" });

const todo = stories.filter((s) => s.status !== "Done");
const labels = [...new Set(todo.flatMap((s) => [`epic:${s.code.toLowerCase()}`, `priority:${s.priority.toLowerCase()}`, ...(s.status === "Blocked" ? ["blocked:external"] : [])]))];
const milestones = [...new Set(todo.map((s) => `Sprint ${s.sprint}`))].sort();

function body(s) {
  const deps = s.dependencies;
  return [
    `**As a** ${s.story.as}, **I want** ${s.story.want}, **so that** ${s.story.so}.`,
    "", `**Epic:** ${s.epic} · **Priority:** ${s.priority} · **Wave:** ${s.wave}`,
    s.blocker ? `\n> Blocked: ${s.blocker}` : "",
    "", "### Business context", s.businessContext,
    "", "### Acceptance criteria", ...s.acceptanceCriteria.map((a) => `- [ ] ${a}`),
    "", "### Dependencies",
    `- Blocking: ${deps.stories.join(", ") || "none"}`, `- Optional: ${deps.optional.join(", ") || "none"}`,
    `- External / API: ${[...deps.external, ...deps.api].join("; ") || "none"}`,
    "", `Full definition: docs/USER_STORIES.md#${s.id.toLowerCase()}`,
  ].join("\n");
}

console.log(`${create ? "Creating" : "Dry run:"} ${todo.length} issues, ${labels.length} labels, ${milestones.length} milestones in ${repo}`);
if (!create) {
  for (const s of todo) console.log(`  ${s.id} — ${s.title}  [${s.priority}, Sprint ${s.sprint}${s.status === "Blocked" ? ", blocked" : ""}]`);
  console.log("\nRe-run with --create to create them.");
  process.exit(0);
}

const existingTitles = JSON.parse(gh(["issue", "list", "--state", "all", "--limit", "500", "--json", "title"])).map((i) => i.title);
for (const l of labels) { try { gh(["label", "create", l, "--force"]); } catch { /* exists */ } }
const existingMilestones = JSON.parse(execFileSync("gh", ["api", `repos/${repo}/milestones?state=all&per_page=100`], { encoding: "utf8" })).map((m) => m.title);
for (const m of milestones) if (!existingMilestones.includes(m)) execFileSync("gh", ["api", `repos/${repo}/milestones`, "-f", `title=${m}`], { encoding: "utf8" });

let created = 0;
for (const s of todo) {
  if (existingTitles.some((t) => t.startsWith(s.id))) { console.log(`  skip ${s.id} (exists)`); continue; }
  const ls = [`epic:${s.code.toLowerCase()}`, `priority:${s.priority.toLowerCase()}`, ...(s.status === "Blocked" ? ["blocked:external"] : [])];
  const url = gh(["issue", "create", "--title", `${s.id} — ${s.title}`, "--body", body(s), "--milestone", `Sprint ${s.sprint}`, ...ls.flatMap((l) => ["--label", l])]).trim();
  console.log(`  ${s.id} → ${url}`);
  created++;
}
console.log(`Created ${created} issue(s).`);
