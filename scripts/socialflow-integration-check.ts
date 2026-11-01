/**
 * Banyan ↔ SocialFlow Lite integration check (track 4).
 *
 * Builds SocialFlow Lite from source, runs it against stand-in LinkedIn and X
 * servers (scripts/fixtures/fake-social-providers.mjs), connects both accounts
 * through the real browser-style OAuth redirects, then drives Banyan's real
 * SocialFlowProvider over REST and over MCP: credentials, accounts and token
 * expiry, publish, idempotent replay, an X thread, status read-back,
 * schedule-then-cancel, and honest "no analytics". Finally it checks what the
 * stand-in platforms actually received.
 *
 *   SOCIALFLOW_LITE_DIR=../ShipStudio/socialflow-lite npx tsx scripts/socialflow-integration-check.ts
 *
 * Needs Go. Starts processes on free local ports and stops them at the end.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { SocialFlowProvider } from "../src/lib/distribution/socialflow/adapter";
import { mcpTransport, resetMcpSessions } from "../src/lib/distribution/socialflow/mcp-transport";
import { operatorFetch } from "../src/lib/net/safe-fetch";

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitFor(url: string, ms = 30_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${url} did not come up`);
}

async function main() {
  const liteDir = process.env.SOCIALFLOW_LITE_DIR;
  if (!liteDir || !fs.existsSync(path.join(liteDir, "go.mod"))) {
    console.error("Set SOCIALFLOW_LITE_DIR to a SocialFlow Lite checkout (branch socialflow-lite of kael-tombo/socialFlow).");
    process.exit(2);
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-int-"));
  const bin = path.join(work, os.platform() === "win32" ? "socialflow-lite.exe" : "socialflow-lite");
  execFileSync("go", ["build", "-o", bin, "./cmd/socialflow-lite"], { cwd: liteDir, stdio: "inherit" });

  const [providerPort, litePort] = [await freePort(), await freePort()];
  const lite = `http://localhost:${litePort}`;
  const providers = `http://127.0.0.1:${providerPort}`;
  const env = {
    ...process.env,
    PORT: String(litePort),
    PUBLIC_URL: lite,
    DATABASE_PATH: path.join(work, "lite.db"),
    ENCRYPTION_KEY: "ab".repeat(32),
    LINKEDIN_CLIENT_ID: "cid", LINKEDIN_CLIENT_SECRET: "cs", LINKEDIN_AUTH_BASE: providers, LINKEDIN_API_BASE: providers,
    X_CONSUMER_KEY: "ck", X_CONSUMER_SECRET: "cs", X_API_BASE: providers,
  };
  const procs: ChildProcess[] = [];
  try {
    procs.push(spawn(process.execPath, [path.join(__dirname, "fixtures", "fake-social-providers.mjs"), String(providerPort), `${lite}/oauth/x/callback`], { stdio: "ignore" }));
    procs.push(spawn(bin, [], { env, stdio: "ignore" }));
    await waitFor(`${providers}/__log`);
    await waitFor(`${lite}/healthz`);
    const keyOut = execFileSync(bin, ["keys", "create", "Banyan integration"], { env }).toString();
    const apiKey = keyOut.match(/api_key:\s+(\S+)/)?.[1] ?? "";
    check(apiKey.startsWith("sfl_"), "SocialFlow Lite issued an API key");
    const ctx = { workspaceId: "integration", credentials: { apiKey } };

    // Connect both accounts through the real redirect chain (connect URL → provider consent → callback).
    const rest = new SocialFlowProvider({ baseUrl: lite, transport: operatorFetch, enabledOverride: true });
    for (const platform of ["linkedin", "x"]) {
      const c = await rest.connectAccount(ctx, platform);
      if (!c.ok) {
        check(false, `connect URL for ${platform}`, c.error.message);
        continue;
      }
      const page = await (await fetch(c.value.connectUrl)).text();
      check(/<h1>Connected /.test(page), `${platform} connected through the browser flow`, page.match(/<h1>([^<]+)<\/h1>/)?.[1]);
    }

    for (const transport of ["rest", "mcp"] as const) {
      resetMcpSessions();
      const sf = new SocialFlowProvider({ baseUrl: lite, transport: transport === "mcp" ? mcpTransport(operatorFetch) : operatorFetch, enabledOverride: true });
      const tag = `[${transport}]`;
      const v = await sf.validateCredentials(ctx);
      check(v.ok && v.channels.sort().join(",") === "linkedin,x", `${tag} credentials verified, both channels active`, v.detail);
      const accounts = await sf.listAccounts(ctx);
      const li = accounts.ok ? accounts.value.find((a) => a.platform === "linkedin") : undefined;
      check(Boolean(li?.tokenExpiresAt && li.tokenExpiresAt > new Date()), `${tag} LinkedIn token expiry reported`);

      const post = { ctx, channel: "linkedin", text: `Integration check over ${transport}`, idempotencyKey: `int-${transport}-li` };
      const p1 = await sf.publish(post);
      check(p1.ok && Boolean(p1.externalUrl), `${tag} LinkedIn post published with a URL`, p1.externalUrl);
      const p2 = await sf.publish(post);
      check(p2.ok && p2.externalId === p1.externalId, `${tag} replay returns the same post`);
      const thread = await sf.publish({ ctx, channel: "x", text: `1/ Integration over ${transport}.\n\n2/ Second post.`, idempotencyKey: `int-${transport}-x` });
      check(thread.ok, `${tag} X thread published`, thread.externalUrl);
      if (p1.externalId) {
        const st = await sf.getStatus(ctx, p1.externalId);
        check(st.ok && st.value.state === "published", `${tag} status reads back as published`);
      }

      const later = new Date(Date.now() + 3_600_000);
      const sched = await sf.schedule({ ctx, channel: "linkedin", text: `Scheduled over ${transport}`, idempotencyKey: `int-${transport}-sched`, scheduledFor: later });
      check(sched.ok && Boolean(sched.externalId), `${tag} post scheduled`);
      if (sched.externalId) {
        const cancel = await sf.cancelScheduled(ctx, sched.externalId);
        check(cancel.ok, `${tag} scheduled post cancelled`, cancel.ok ? "" : cancel.error.message);
        const st = await sf.getStatus(ctx, sched.externalId);
        check(st.ok && st.value.state === "cancelled", `${tag} status reads back as cancelled`);
        const again = await sf.schedule({ ctx, channel: "linkedin", text: `Scheduled over ${transport}`, idempotencyKey: `int-${transport}-sched`, scheduledFor: later });
        check(!again.ok || again.externalId === sched.externalId, `${tag} replaying the schedule does not resurrect it`);
      }
      if (p1.externalId) {
        const a = await sf.getAnalytics(ctx, p1.externalId);
        check(!a.ok, `${tag} analytics honestly unsupported`);
      }
    }

    const log = (await (await fetch(`${providers}/__log`)).json()) as { linkedinPosts: unknown[]; tweets: { reply?: { in_reply_to_tweet_id: string } }[] };
    check(log.linkedinPosts.length === 2, "LinkedIn received exactly 2 posts (one per transport; no duplicates, nothing cancelled went out)", String(log.linkedinPosts.length));
    check(log.tweets.length === 4 && log.tweets.filter((t) => t.reply).length === 2, "X received two correctly chained 2-post threads", String(log.tweets.length));
  } finally {
    // Wait for the children to exit: Windows keeps the SQLite file locked until then.
    await Promise.all(procs.map((p) => (p.exitCode !== null ? null : new Promise((r) => { p.once("exit", r); p.kill(); }))));
    try {
      fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      console.log(`(left temporary files in ${work})`);
    }
  }
  console.log(failures === 0 ? "\nAll integration checks passed." : `\n${failures} integration check(s) failed.`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
