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

// ---- Child: one worker process running one task (research, or a LinkedIn draft) ----

if (role === "child") {
  const [workspaceId, taskId, type = "research", goalId = "", outputB64 = "", attempts = "1"] = process.argv.slice(3);
  const drafting = type === "content_draft";
  const planning = type === "plan_draft";
  const handlers = await import("../src/lib/agents/handlers/planning");
  const handler = drafting ? (await import("../src/lib/agents/handlers/distribution")).handleContentDraft : planning ? handlers.handlePlanDraft : handlers.handleResearch;
  const output = outputB64 ? JSON.parse(Buffer.from(outputB64, "base64").toString("utf8")) : null;
  const result = await handler({
    task: { id: taskId, workspaceId, goalId: goalId || null, campaignId: null, dedupeKey: taskId, type, title: drafting ? "Draft" : planning ? "Plan" : "Research", agentRole: drafting ? "writer" : planning ? "planner" : "researcher", status: "running", inputs: drafting ? { channel: "linkedin", format: "insight" } : {}, expectedOutput: "", output, verification: { kind: "nonempty" }, requiresApproval: false, dependsOn: [], attempts: Number(attempts), maxAttempts: 3, lastError: null, leasedUntil: null, startedAt: new Date() },
    workspaceId: workspaceId!,
    goalId: goalId || null,
    userId: null,
    log: () => {},
  } as never);
  process.stdout.write(`RESULT ${JSON.stringify(result)}\n`);
  process.exit(0);
}

// ---- Parent: a scripted model, two workspaces, and the checks ----

type Call = { product: string; toolTurns: number; aborted: boolean; model: string; sawQuestion: boolean };
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
  const call: Call = { product, toolTurns, aborted: false, model: String(body.model ?? ""), sawQuestion: /start with B2B or B2C/.test(all) && all.includes("The founder answered") };
  calls.push(call);
  res.on("close", () => {
    if (!res.writableEnded) call.aborted = true;
  });
  const chunk = (delta: unknown, finish: string | null = null) => res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  // A CheckCo-loop writer never saves and reports large prompts, so only its token budget stops it.
  const looping = product.startsWith("CheckCo-loop");
  const end = () => {
    const prompt = looping ? 600 : 200;
    res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: body.model, choices: [], usage: { prompt_tokens: prompt, completion_tokens: 40, total_tokens: prompt + 40 } })}\n\n`);
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
  if (all.includes("You are Banyan's planner")) {
    // Asks once; once the answer is in the conversation, writes the plan.
    if (all.includes("The founder answered your question")) {
      chunk({ role: "assistant", content: JSON.stringify({ summary: `Start with B2B founders for ${product}.`, assumptions: ["Founders read LinkedIn"], missingInfo: [], risks: ["Small audience"], phases: [{ name: "Research", description: "Interview five founders", taskTypes: ["research"] }] }) }, "stop");
      return end();
    }
    if (toolTurns === 0) return tool("banyan_ask_founder", { question: `Should ${product} start with B2B or B2C customers?` });
    chunk({ role: "assistant", content: "Waiting for the founder." }, "stop");
    return end();
  }
  if (looping && all.includes("You are Banyan's writer")) {
    await sleep(700);
    return tool("banyan_channel_rules", {});
  }
  if (all.includes("You are Banyan's writer")) {
    if (toolTurns === 0) return tool("banyan_channel_rules", {});
    if (toolTurns === 1) return tool("banyan_propose_draft", { body: `${product} turns a messy weekly schedule into a plan your team can follow. Try it this week.` });
    chunk({ role: "assistant", content: "Saved." }, "stop");
    return end();
  }
  if (all.includes("You are Banyan's critic")) {
    if (toolTurns === 0) return tool("banyan_flag", { kind: "risky_topic", excerpt: "messy weekly schedule", note: "Make sure this does not read as a dig at the reader." });
    chunk({ role: "assistant", content: "Reviewed." }, "stop");
    return end();
  }
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

function worker(workspaceId: string, taskId: string, type = "research", extraEnv: Record<string, string> = {}, plan: { goalId: string; output?: unknown; attempts?: number } | null = null) {
  const planArgs = plan ? [plan.goalId, plan.output ? Buffer.from(JSON.stringify(plan.output)).toString("base64") : "", String(plan.attempts ?? 1)] : [];
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/agent-runtime-check.mts", "child", workspaceId, taskId, type, ...planArgs], { env: { ...childEnv, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
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

  // ---- A LinkedIn draft: a writer agent, then a critic
  const productC = `CheckCo-${randomBytes(3).toString("hex")}`;
  const wsC = await makeWorkspace(productC);
  const taskC = `task_${randomBytes(4).toString("hex")}`;
  const c = await worker(wsC, taskC, "content_draft").done;
  const outC = c.result?.output;
  const items = await prisma.contentItem.findMany({ where: { workspaceId: wsC } });
  const item = items[0];
  check("The draft task ran through the writer and the critic", /OpenCode writer agent.*checked by the critic/.test(outC?.generatedLabel ?? ""), { label: outC?.generatedLabel, code: c.code, logs: c.result ? undefined : c.err });
  check("One draft, waiting for review, from the writer", items.length === 1 && item?.status === "ready_for_review" && item.sourceRef === `task:${taskC}` && (item.body ?? "").length > 20, items.map((i) => ({ status: i.status, length: i.body.length })));
  const criticFlags = JSON.parse(item?.checks ?? "[]").filter((f: { code: string }) => f.code === "critic");
  check("The critic's flags are stored on the draft", REAL ? Array.isArray(criticFlags) : criticFlags.length === 1 && criticFlags[0].kind === "risky_topic", criticFlags);
  const ledgerC = await prisma.modelCall.findMany({ where: { workspaceId: wsC } });
  check("One ledger row for each of the two runs", ledgerC.filter((l) => l.provider === "opencode-runtime").map((l) => l.purpose).sort().join() === "content_draft,content_review", ledgerC.map((l) => ({ purpose: l.purpose, provider: l.provider, ok: l.ok })));

  if (REAL) {
    // The planner may or may not ask. If it does, answer as a founder would and let it continue.
    const wsR = await makeWorkspace(`CheckCo-${randomBytes(3).toString("hex")}`);
    const goalR = await prisma.goal.create({ data: { workspaceId: wsR, objective: "Get 20 signups in 30 days", successMetric: "signups", status: "planning" } });
    const taskR = `task_${randomBytes(4).toString("hex")}`;
    const first = (await worker(wsR, taskR, "plan_draft", {}, { goalId: goalR.id }).done).result;
    let planOutcome = first?.outcome;
    if (first?.outcome === "blocked") {
      const answered = { ...first.output, data: { ...first.output.data, answer: "Small B2B software teams of 3 to 20 people. No paid ads; LinkedIn and X only." } };
      planOutcome = (await worker(wsR, taskR, "plan_draft", {}, { goalId: goalR.id, output: answered, attempts: 2 }).done).result?.outcome;
    }
    const planR = await prisma.goalPlan.findUnique({ where: { goalId: goalR.id } });
    check("The real planner produced a plan (asking first if it chose to)", planOutcome === "waiting_approval" && /planner agent/.test(JSON.parse(planR?.generatedMeta ?? "{}").label ?? ""), { asked: first?.outcome === "blocked" ? first.actionable : null, outcome: planOutcome, label: JSON.parse(planR?.generatedMeta ?? "{}").label });
    console.log(JSON.stringify({ plannerQuestion: first?.outcome === "blocked" ? first.actionable : "(did not ask)", planSummary: planR?.summary, missingInfo: planR?.missingInfo }, null, 2));

    console.log("\nReal-model output, for a person to read:");
    console.log(JSON.stringify({ brief: outA?.data, notes: notesA.map((n) => n.value), draft: item?.body, criticFlags: criticFlags.map((f: { message: string }) => f.message) }, null, 2));
    throw new Error("__real_done__");
  }

  // ---- The planner asks the founder one question, waits, and continues the same session with the answer (R4)
  const productE = `CheckCo-${randomBytes(3).toString("hex")}`;
  const wsE = await makeWorkspace(productE);
  const goal = await prisma.goal.create({ data: { workspaceId: wsE, objective: "Get 20 signups", successMetric: "signups", status: "planning" } });
  const taskE = `task_${randomBytes(4).toString("hex")}`;
  const asked = (await worker(wsE, taskE, "plan_draft", {}, { goalId: goal.id }).done).result;
  check("The planner asked a question, and the task waits for the founder with it", asked?.outcome === "blocked" && /B2B or B2C/.test(asked?.actionable ?? "") && asked?.output?.data?.runId === "attempt-1", { outcome: asked?.outcome, actionable: asked?.actionable });
  const callsBeforeAnswer = calls.filter((c) => c.product === productE).length;
  // What the answer API stores on the task, then the task runs again as a later attempt.
  const answered = { ...asked?.output, data: { ...asked?.output?.data, answer: "B2B: small software teams." } };
  const resumed = (await worker(wsE, taskE, "plan_draft", {}, { goalId: goal.id, output: answered, attempts: 2 }).done).result;
  const planRow = await prisma.goalPlan.findUnique({ where: { goalId: goal.id } });
  const afterAnswer = calls.filter((c) => c.product === productE).slice(callsBeforeAnswer);
  check("With the answer, the planner finished the plan, which waits for approval", resumed?.outcome === "waiting_approval" && /B2B founders/.test(planRow?.summary ?? ""), { outcome: resumed?.outcome, summary: planRow?.summary, label: JSON.parse(planRow?.generatedMeta ?? "{}").label });
  check("It continued the same session: the model saw its own question and the answer, in one more call", afterAnswer.length === 1 && afterAnswer[0]!.sawQuestion, { callsAfterAnswer: afterAnswer.length, sawQuestion: afterAnswer[0]?.sawQuestion });

  // ---- A writer that never finishes: its token budget stops it, and nothing more is spent (R4)
  const productD = `CheckCo-loop${randomBytes(3).toString("hex")}`;
  const wsD = await makeWorkspace(productD);
  const d = await worker(wsD, `task_${randomBytes(4).toString("hex")}`, "content_draft", { AGENT_RUN_MAX_TOKENS: "1000" }).done;
  const outD = d.result?.output;
  const callsD = calls.filter((c) => c.product === productD);
  const incidents = await prisma.activityEvent.findMany({ where: { workspaceId: wsD, type: "agent_incident" } });
  const itemsD = await prisma.contentItem.findMany({ where: { workspaceId: wsD } });
  check("A writer over its token budget is stopped, and the incident is recorded", incidents.length === 1 && /token budget/.test(incidents[0]!.summary), { incidents: incidents.map((i) => i.summary), logs: d.result ? undefined : d.err });
  check(
    "Nothing more is spent: the draft comes from the free template, not another model call",
    callsD.every((c) => c.model !== "fallback-model") && itemsD.length === 1 && outD?.isFallback === true && itemsD[0]!.status === "ready_for_review",
    { modelCalls: callsD.length, label: outD?.generatedLabel, items: itemsD.length }
  );

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
