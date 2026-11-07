#!/usr/bin/env node
// Experimental, development-only: start a local OpenCode server for Banyan to
// use as a temporary brain while no OPENAI_API_KEY is configured.
//
// This is NOT the ADR-006 agent runtime (docs/architecture/AGENT_ORCHESTRATION.md):
// it is a text-in/text-out gateway over OpenCode's V1 HTTP API. The embedded
// V2 runtime (@opencode/sdk, tools + subagents) arrives with roadmap R2 and
// retires this script. Do not grow features on this seam.
//
//   npm run brain:opencode
//
// Reads OPENCODE_URL / OPENCODE_PASSWORD / OPENCODE_MODEL from .env when set,
// otherwise prints the lines to add. The server binds to 127.0.0.1 only, is
// password protected, and runs from an empty temp directory so the OpenCode
// agent never sees this repository. Banyan disables every OpenCode tool per
// call; this process is only a text-in, text-out model gateway.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createConnection } from "node:net";

function readDotEnv() {
  const out = {};
  if (!existsSync(".env")) return out;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const dot = readDotEnv();
const url = new URL(process.env.OPENCODE_URL || dot.OPENCODE_URL || "http://127.0.0.1:4097");
const password = process.env.OPENCODE_PASSWORD || dot.OPENCODE_PASSWORD || randomBytes(24).toString("hex");
const model = process.env.OPENCODE_MODEL || dot.OPENCODE_MODEL || "opencode/deepseek-v4.1-flash-free";
const configured = !!(dot.OPENCODE_URL && dot.OPENCODE_PASSWORD);

if (dot.OPENAI_API_KEY) {
  console.log("[brain] OPENAI_API_KEY is set in .env — Banyan will use it and ignore the OpenCode brain.");
}

const port = Number(url.port || 4097);
const inUse = await new Promise((resolve) => {
  const probe = createConnection({ host: "127.0.0.1", port }, () => {
    probe.end();
    resolve(true);
  });
  probe.on("error", () => resolve(false));
});
if (inUse) {
  console.error(`[brain] Port ${port} is already in use (an earlier brain still running?). Stop it or set OPENCODE_URL to another port.`);
  process.exit(1);
}

const cwd = join(tmpdir(), "banyan-opencode-brain");
mkdirSync(cwd, { recursive: true });

const child = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd,
  env: { ...process.env, OPENCODE_SERVER_PASSWORD: password },
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("error", (err) => {
  console.error(`[brain] could not start opencode (${err.message}). Install it: npm i -g opencode-ai`);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));

const stop = () => {
  if (process.platform === "win32" && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  else child.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

console.log(`[brain] OpenCode brain on ${url.origin} using ${model}`);
if (!configured) {
  console.log("[brain] Add these to .env, then restart `npm run dev`:\n");
  console.log(`OPENCODE_URL="${url.origin}"`);
  console.log(`OPENCODE_PASSWORD="${password}"`);
  console.log(`OPENCODE_MODEL="${model}"\n`);
}
console.log("[brain] Model must be one OpenCode can reach: `opencode models` lists them; `opencode auth login` fixes keys.");
