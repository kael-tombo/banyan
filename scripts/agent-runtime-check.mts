/**
 * End-to-end check of the embedded OpenCode runtime (roadmap R2): the real research handler,
 * the real @opencode/sdk host, Banyan's tools against a real database, and a scripted model
 * that costs nothing. Includes killing the worker mid-run and starting it again.
 *
 *   AGENT_CHECK_THROWAWAY_DB=1 DATABASE_URL=postgresql://…/throwaway npx tsx scripts/agent-runtime-check.mts
 *
 * Needs Node 24 and a migrated database it may write to. It refuses otherwise.
 *
 * AGENT_CHECK_REAL_MODEL=opencode-go/glm-5.3-flash runs the normal scenario once against that real model instead,
 * spending a little of the key. The key comes from OPENCODE_API_KEY, or from .env when OPENAI_BASE_URL there is
 * OpenCode Go. Internal testing only: the subscription terms forbid customer work.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const role = process.argv[2] ?? "parent";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`Needs Node 24; this is ${process.versions.node}.`);
if (process.env.AGENT_CHECK_THROWAWAY_DB !== "1") throw new Error("Set AGENT_CHECK_THROWAWAY_DB=1 to confirm DATABASE_URL is a throwaway database this check may write to.");

// ---- Child: one worker process running one research task ----

if (role === "child") {
  const [workspaceId, taskId] = process.argv.slice(3);
  const { handleResearch } = await import("../src/lib/agents/handlers/planning");
  const result = await handleResearch({
    task: { id: taskId, workspaceId, goalId: null, campaignId: null, dedupeKey: taskId, type: "research", title: "Research", agentRole: "researcher", status: "running", inputs: {}, expectedOutput: "", output: null, verification: { kind: "nonempty" }, requiresApproval: false, dependsOn: [], attempts: 1, maxAttempts: 3, lastError: null, leasedUntil: null, startedAt: new Date() },
    workspaceId: workspaceId!,
    goalId: null,
    userId: null,
    log: () => {},
  } as never);
  process.stdout.write(`RESULT ${JSON.stringify(result)}\n`);
  process.exit(0);
}

// ---- Parent: a scripted model, two workspaces, and the checks ----

type Call = { product: string; toolTurns: number; aborted: boolean };
const calls: Call[] = [];
let hangProduct: string | null = null;

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => resolve(raw));
  });

async function model(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req));
  const messages: { role: string; content: unknown }[] = body.messages ?? [];
  const all = JSON.stringify(messages);
  const product = /CheckCo-[a-z0-9]+/.exec(all)?.[0] ?? "none";
  const toolTurns = messages.filter((m) => m.role === "tool").length;
  const call: Call = { product, toolTurns, aborted: false };
  calls.push(call);
  res.on("close", () => {
    if (!res.writableEnded) call.aborted = true;
  });
  const chunk = (delta: unknown, finish: string | null = null) => res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  const end = () => {
    res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: body.model, choices: [], usage: { prompt_tokens: 200, completion_tokens: 40, total_tokens: 240 } })}\n\n`);
    res.end("data: [DONE]\n\n");
  };
  res.writeHead(200, { "content-type": "text/event-stream" });
  if (!(body.tools ?? []).length && !all.includes("banyan_record_note")) {
    chunk({ role: "assistant", content: "A title" }, "stop");
    return end();
  }
  const tool = (name: string, args: unknown) => {
    chunk({ role: "assistant", content: null, tool_calls: [{ index: 0, id: `call_${randomBytes(4).toString("hex")}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
    chunk({}, "tool_calls");
    end();
  };
  if (toolTurns === 0) return tool("banyan_read_context", {});
  if (toolTurns === 1) return tool("banyan_record_note", { text: `People who build ${product} hear about tools from peers in small communities.`, provenance: "hypothesis" });
  if (hangProduct === product) {
    hangProduct = null;
    chunk({ role: "assistant", content: "Working" });
    return; // Hangs until the worker dies.
  }
  chunk({ role: "assistant", content: JSON.stringify({ questions: ["Where do these founders discover tools today?"], hypothesisAngles: [`Peer communities drive discovery for ${product}.`], sourcesNeeded: ["Five founder interviews"], labelledAs: "hypothesis" }) });
  chunk({}, "stop");
  end();
}

const server = createServer((req, res) => void model(req, res).catch(() => res.destroy()));
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const port = (server.address() as AddressInfo).port;

const box = mkdtempSync(join(tmpdir(), "banyan-agent-check-"));
const REAL = process.env.AGENT_CHECK_REAL_MODEL ?? "";
function realKey(): string {
  if (process.env.OPENCODE_API_KEY) return process.env.OPENCODE_API_KEY;
  const { parse } = require("dotenv") as typeof import("dotenv");
  const file = parse(readFileSync(".env"));
  if (!/opencode\.ai/.test(file.OPENAI_BASE_URL ?? "") || !file.OPENAI_API_KEY) throw new Error("No OpenCode key: set OPENCODE_API_KEY.");
  return file.OPENAI_API_KEY;
}
const realEnv = REAL ? { AGENT_MODEL_STRONG: REAL, AGENT_MODEL_FAST: REAL, AGENT_MODEL_CRITIC: REAL, OPENCODE_API_KEY: realKey() } : {};
const childEnv = {
  ...process.env,
  // The direct fallback must not reach a real model either: it goes to the scripted one too.
  AI_PROVIDER: "openai",
  OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
  OPENAI_API_KEY: "check",
  OPENAI_MODEL: "fallback-model",
  AGENT_RUNTIME: "opencode",
  AGENT_MODEL_STRONG: "mock/m1",
  AGENT_MODEL_FAST: "mock/m1",
  AGENT_MODEL_CRITIC: "other/m2",
  AGENT_OPENCODE_DB: join(box, "sessions.db"),
  AGENT_OPENCODE_PROVIDERS: JSON.stringify({
    mock: { package: "aisdk:@ai-sdk/openai-compatible", settings: { baseURL: `http://127.0.0.1:${port}/v1` }, models: { m1: { capabilities: { tools: true }, limit: { context: 200000, output: 4000 } } } },
    other: { package: "aisdk:@ai-sdk/openai-compatible", settings: { baseURL: `http://127.0.0.1:${port}/v1` }, models: { m2: { capabilities: { tools: true } } } },
  }),
  XDG_CONFIG_HOME: join(box, "config"),
  XDG_DATA_HOME: join(box, "data"),
  XDG_STATE_HOME: join(box, "state"),
  XDG_CACHE_HOME: join(box, "cache"),
  ...realEnv,
};

function worker(workspaceId: string, taskId: string) {
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/agent-runtime-check.mts", "child", workspaceId, taskId], { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  const done = new Promise<{ code: number | null; result: any; err: string }>((resolve) =>
    child.on("exit", (code) => {
      const line = out.split("\n").find((l) => l.startsWith("RESULT "));
      const logs = (err + out).split("\n").filter((l) => /agent_run|error|Error|warn/i.test(l));
      resolve({ code, result: line ? JSON.parse(line.slice(7)) : null, err: logs.join("\n").slice(-2500) });
    })
  );
  return { child, done };
}

const { prisma } = await import("../src/lib/db");
const checks: { name: string; ok: boolean; detail?: unknown }[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`);
};

async function makeWorkspace(product: string) {
  const suffix = randomBytes(4).toString("hex");
  const org = await prisma.organization.create({ data: { name: `Check ${suffix}`, slug: `check-${suffix}` } });
  const ws = await prisma.workspace.create({ data: { organizationId: org.id, name: product, slug: `check-${suffix}` } });
  await prisma.productProfile.create({ data: { workspaceId: ws.id, name: product, description: "A scheduling tool for small teams.", stage: "launched", problem: "Teams lose time.", valueProp: "Saves an hour a week." } });
  return ws.id;
}
const notesFor = (workspaceId: string) => prisma.profileFact.findMany({ where: { workspaceId, category: "research", key: { startsWith: "note:" } } });
const ledgerFor = (workspaceId: string) => prisma.modelCall.findMany({ where: { workspaceId, purpose: "research" } });

try {
  // ---- A normal run
  const productA = `CheckCo-${randomBytes(3).toString("hex")}`;
  const wsA = await makeWorkspace(productA);
  const a = await worker(wsA, `task_${randomBytes(4).toString("hex")}`).done;
  const outA = a.result?.output;
  check("The research handler ran through the OpenCode researcher agent", /OpenCode researcher agent/.test(outA?.generatedLabel ?? ""), { label: outA?.generatedLabel, isFallback: outA?.isFallback, code: a.code, logs: a.err });
  check("Its output is the same research brief downstream tasks expect", Array.isArray(outA?.data?.hypothesisAngles) && outA.data.labelledAs === "hypothesis");
  const notesA = await notesFor(wsA);
  check("The agent's note is stored with hypothesis provenance and the task as source", (REAL ? notesA.length >= 1 : notesA.length === 1) && notesA[0]!.provenance === "hypothesis" && /task:/.test(notesA[0]!.source ?? ""), notesA.map((n) => ({ provenance: n.provenance, source: n.source })));
  const ledgerA = await ledgerFor(wsA);
  check("One ledger row records the run's usage", ledgerA.length === 1 && ledgerA[0]!.provider === "opencode-runtime" && ledgerA[0]!.promptTokens > 0 && ledgerA[0]!.ok, ledgerA.map((l) => ({ provider: l.provider, model: l.model, promptTokens: l.promptTokens, completionTokens: l.completionTokens, ok: l.ok })));

  if (REAL) {
    console.log("\nReal-model output, for a person to read:");
    console.log(JSON.stringify({ brief: outA?.data, notes: notesA.map((n) => n.value) }, null, 2));
    throw new Error("__real_done__");
  }

  // ---- Kill the worker mid-run, start it again
  const productB = `CheckCo-${randomBytes(3).toString("hex")}`;
  const wsB = await makeWorkspace(productB);
  const taskB = `task_${randomBytes(4).toString("hex")}`;
  hangProduct = productB;
  const first = worker(wsB, taskB);
  const deadline = Date.now() + 60_000;
  while (!calls.some((c) => c.product === productB && c.toolTurns === 2) && Date.now() < deadline) await sleep(100);
  await sleep(500);
  first.child.kill("SIGKILL");
  await first.done;
  const callsBefore = calls.filter((c) => c.product === productB).length;
  const second = await worker(wsB, taskB).done;
  const outB = second.result?.output;
  const callsB = calls.filter((c) => c.product === productB);
  check("After the worker was killed, the restarted worker finished the same task through the agent", /OpenCode researcher agent/.test(outB?.generatedLabel ?? ""), { label: outB?.generatedLabel, code: second.code, err: second.result ? undefined : second.err });
  const notesB = await notesFor(wsB);
  check("Killing it mid-run duplicated nothing: one note", notesB.length === 1, { notes: notesB.length });
  check("The restart reused the session rather than starting the work again", callsB.length - callsBefore <= 2, { modelCallsBeforeKill: callsBefore, modelCallsAfter: callsB.length - callsBefore });
  const ledgerB = await ledgerFor(wsB);
  check("One ledger row for the task, written by the run that finished", ledgerB.length === 1 && ledgerB[0]!.provider === "opencode-runtime", ledgerB.map((l) => ({ provider: l.provider, ok: l.ok })));
} catch (err) {
  if ((err as Error).message !== "__real_done__") throw err;
} finally {
  server.closeAllConnections();
  server.close();
  await prisma.$disconnect();
  rmSync(box, { recursive: true, force: true, maxRetries: 3 });
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
process.exit(failed ? 1 : 0);
