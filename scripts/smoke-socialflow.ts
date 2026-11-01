/**
 * US-037 — the live smoke test that gates SOCIALFLOW_VERIFIED=true.
 *
 * Runs Banyan's real SocialFlowProvider (not a mock) against a live
 * SocialFlow API — e.g. SocialFlow Lite — with real connected accounts.
 *
 *   npm run smoke:socialflow                       read-only: verify key, list accounts and capabilities
 *   npm run smoke:socialflow -- --connect linkedin print a connect URL to open in your browser (also: x)
 *   npm run smoke:socialflow -- --publish          ALSO publishes one LinkedIn post and one 2-post X thread
 *
 * Env: SOCIALFLOW_API_URL, SOCIALFLOW_API_KEY (an organisation key from
 * `socialflow-lite keys create`), optionally SOCIALFLOW_ALLOW_PRIVATE_NETWORK=true.
 *
 * --publish posts publicly under the connected accounts. Delete the test posts
 * by hand afterwards. Passing it is what justifies SOCIALFLOW_VERIFIED=true.
 */
import { SocialFlowProvider } from "@/lib/distribution/socialflow/adapter";
import type { ProviderContext } from "@/lib/distribution/types";

const args = process.argv.slice(2);
const publish = args.includes("--publish");
const connectIdx = args.indexOf("--connect");
const connectPlatform = connectIdx >= 0 ? args[connectIdx + 1] : undefined;

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const baseUrl = process.env.SOCIALFLOW_API_URL ?? "";
  const apiKey = process.env.SOCIALFLOW_API_KEY ?? "";
  if (!baseUrl || !apiKey) {
    console.error("Set SOCIALFLOW_API_URL and SOCIALFLOW_API_KEY.");
    process.exit(2);
  }
  // Bypass only the SOCIALFLOW_VERIFIED gate: proving the provider is this script's job.
  const provider = new SocialFlowProvider({ baseUrl, enabledOverride: true });
  const ctx: ProviderContext = { workspaceId: "smoke-test", credentials: { apiKey } };

  const verified = await provider.validateCredentials(ctx);
  check(verified.ok, "API key accepted (C1)", verified.detail);
  if (!verified.ok) return;

  if (connectPlatform) {
    const res = await provider.connectAccount(ctx, connectPlatform);
    if (res.ok) console.log(`\nOpen this in your browser within 30 minutes to connect ${connectPlatform}:\n  ${res.value.connectUrl}\n`);
    check(res.ok, `connect URL issued for ${connectPlatform} (C2)`, res.ok ? "" : res.error.message);
    return;
  }

  const accounts = await provider.listAccounts(ctx);
  check(accounts.ok, "accounts listed (C3)");
  if (!accounts.ok) return;
  for (const a of accounts.value) {
    console.log(`  ${a.platform.padEnd(9)} ${a.status.padEnd(7)} ${a.handle}  publish=${a.capabilities.publish} schedule=${a.capabilities.schedule} analytics=${a.capabilities.analytics}`);
    const caps = await provider.getCapabilities(ctx, a.id);
    check(caps.ok, `capabilities for ${a.platform} ${a.handle} (C4)`);
  }
  const active = (p: string) => accounts.value.find((a) => a.platform === p && a.status === "active");
  const li = active("linkedin");
  const x = active("x");
  check(Boolean(li), "an active LinkedIn account is connected", li ? li.handle : "run with --connect linkedin");
  check(Boolean(x), "an active X account is connected", x ? x.handle : "run with --connect x");

  if (!publish) {
    console.log("\nRead-only run. Re-run with --publish to post one LinkedIn post and one 2-post X thread.");
    return;
  }
  if (!li || !x) return;

  const stamp = new Date().toISOString();
  const jobs = [
    { channel: "linkedin", accountId: li.id, text: `Testing a publishing integration for Banyan (${stamp}). This post will be removed shortly.` },
    { channel: "x", accountId: x.id, text: `1/ Testing a publishing integration for Banyan (${stamp}).\n\n2/ This thread will be removed shortly.` },
  ];
  for (const job of jobs) {
    const key = `smoke-${job.channel}-${stamp}`;
    const out = await provider.publish({ ctx, ...job, idempotencyKey: key });
    check(out.ok && Boolean(out.externalId), `${job.channel} published with a provider id (C5)`, out.ok ? (out.externalUrl ?? "no URL") : `${out.errorCode}: ${out.error}`);
    if (!out.ok || !out.externalId) continue;

    const replay = await provider.publish({ ctx, ...job, idempotencyKey: key });
    check(replay.ok && replay.externalId === out.externalId, `${job.channel} replay with the same key returns the same post (no duplicate)`);

    const status = await provider.getStatus(ctx, out.externalId);
    check(status.ok && status.value.state === "published", `${job.channel} status reads back as published (C7)`, status.ok ? (status.value.url ?? "") : "");
    if (out.externalUrl) console.log(`  → delete by hand when done: ${out.externalUrl}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(() => {
    console.log(
      failures === 0
        ? publish
          ? "\nAll checks passed. If these are real LinkedIn and X accounts (not a test double), you may set SOCIALFLOW_VERIFIED=true."
          : "\nAll checks passed."
        : `\n${failures} check(s) failed. Do not set SOCIALFLOW_VERIFIED.`,
    );
    process.exit(failures === 0 ? 0 : 1);
  });
