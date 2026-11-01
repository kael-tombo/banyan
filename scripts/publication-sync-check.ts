/**
 * Publication status sync (BOS-027) and cancel (BOS-029) against a real
 * database, through the real publishing workflow, with a scripted provider.
 * Deletes everything it created.
 *
 *   npx tsx --env-file=.env scripts/publication-sync-check.ts
 */
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { registerProvider } from "@/lib/distribution/providers";
import type { DistributionProvider } from "@/lib/distribution/types";
import { attemptPublication, executePublication } from "@/lib/publishing/publish";
import { backfillPublishedUrls, cancelPendingPublication } from "@/lib/publishing/status-sync";

type State = "queued" | "scheduled" | "published" | "failed" | "cancelled";
const script = {
  publishAnswer: "queued" as State,
  status: new Map<string, { state: State; url?: string }>(),
  cancelRefused: false,
  calls: [] as string[],
};
const unsupported = async () => ({ ok: false as const, error: { code: "unsupported" as const, message: "n/a", retryable: false } });
const fake: DistributionProvider = {
  id: "scripted",
  label: "Scripted provider",
  enabled: () => true,
  validateCredentials: async () => ({ ok: true, detail: "ok", channels: ["linkedin"] }),
  connectAccount: unsupported,
  listAccounts: unsupported,
  getCapabilities: unsupported,
  revokeAccount: unsupported,
  async publish(req) {
    script.calls.push(`publish:${req.idempotencyKey}`);
    const id = `ext-${req.idempotencyKey.replace(/[^A-Za-z0-9]/g, "")}`;
    if (script.publishAnswer === "published") return { ok: true, externalId: id, raw: {} }; // confirmed, but no URL yet
    return { ok: false, retryable: true, externalId: id, error: "accepted, not confirmed", raw: {} };
  },
  async schedule() {
    return { ok: false, error: "not used", raw: {} };
  },
  async getStatus(_ctx, externalId) {
    script.calls.push(`status:${externalId}`);
    const s = script.status.get(externalId);
    return s ? { ok: true, value: s } : { ok: false, error: { code: "not_found", message: "no such post", retryable: false } };
  },
  async cancelScheduled(_ctx, externalId) {
    script.calls.push(`cancel:${externalId}`);
    if (script.cancelRefused) return { ok: false, error: { code: "unknown", message: "already published; delete it on the platform itself", retryable: false } };
    script.status.set(externalId, { state: "cancelled" });
    return { ok: true, value: { state: "cancelled" } };
  },
  getAnalytics: unsupported,
};

async function main() {
  registerProvider(fake);
  let failures = 0;
  const check = (ok: boolean, label: string, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
  };
  const stamp = Date.now();
  const user = await prisma.user.create({ data: { email: `sync-${stamp}@check.local`, name: "Sync Check" } });
  const ws = await prisma.workspace.create({
    data: { organization: { create: { name: "sync-check", slug: `sync-check-${stamp}` } }, name: "sync-check", slug: `sc-${stamp}` },
  });
  try {
    await prisma.membership.create({ data: { userId: user.id, workspaceId: ws.id, role: "owner" } });
    const conn = await prisma.channelConnection.create({
      data: { workspaceId: ws.id, channel: "linkedin", adapter: "scripted", label: "Scripted", configEncrypted: encryptSecret("{}"), status: "verified" },
    });
    const approved = (title: string) =>
      prisma.contentItem.create({
        data: { workspaceId: ws.id, channel: "linkedin", format: "post", title, body: `${title} body`, status: "approved", approvedById: user.id, approvedAt: new Date() },
      });
    const due = (id: string) => prisma.publication.update({ where: { id }, data: { scheduledFor: new Date(Date.now() - 1000) } });
    const pub = (id: string) => prisma.publication.findUniqueOrThrow({ where: { id } });

    // 1. Accepted but unconfirmed: kept with its provider id, not published.
    const a = await approved("Queued then confirmed");
    const r1 = await attemptPublication({ contentItemId: a.id, workspaceId: ws.id, connectionId: conn.id, mode: "now" });
    let pa = await pub(r1.publicationId!);
    check(r1.status === "retry_scheduled" && pa.status === "scheduled" && Boolean(pa.externalId), "an accepted-but-unconfirmed post waits, keeping the provider's id", `${r1.status} ${pa.externalId}`);
    check((await prisma.contentItem.findUniqueOrThrow({ where: { id: a.id } })).status !== "published", "the content is not marked published before confirmation");

    // 2. The next attempt asks for status instead of sending again; confirmed → published with its URL.
    script.status.set(pa.externalId!, { state: "published", url: "https://www.linkedin.com/feed/update/urn:li:share:42/" });
    script.calls.length = 0;
    await due(pa.id);
    const r2 = await executePublication(pa.id);
    pa = await pub(pa.id);
    check(r2.ok && pa.status === "published" && pa.externalUrl === "https://www.linkedin.com/feed/update/urn:li:share:42/", "status read-back publishes it with the live URL", `${pa.status} ${pa.externalUrl}`);
    check(!script.calls.some((c) => c.startsWith("publish:")), "the post was not sent a second time", script.calls.join(","));

    // 3. Provider reports failure → terminal failure, no resend.
    const b = await approved("Queued then failed");
    const rb = await attemptPublication({ contentItemId: b.id, workspaceId: ws.id, connectionId: conn.id, mode: "now" });
    let pb = await pub(rb.publicationId!);
    script.status.set(pb.externalId!, { state: "failed" });
    await due(pb.id);
    await executePublication(pb.id);
    pb = await pub(pb.id);
    check(pb.status === "failed" && /failed to publish/.test(pb.lastError ?? ""), "a provider-reported failure ends it honestly", pb.lastError ?? "");

    // 4. Cancel while the provider holds it: refused → nothing changes; accepted → cancelled in both places.
    const c = await approved("Cancel me");
    const rc = await attemptPublication({ contentItemId: c.id, workspaceId: ws.id, connectionId: conn.id, mode: "now" });
    const cid = rc.publicationId!;
    script.cancelRefused = true;
    const refused = await cancelPendingPublication(c.id, ws.id, user.id);
    check(!refused.ok && refused.status === 409 && (await pub(cid)).status === "scheduled", "a refused provider cancel leaves Banyan unchanged (409)", refused.ok ? "" : refused.message);
    script.cancelRefused = false;
    const done = await cancelPendingPublication(c.id, ws.id, user.id);
    const pc = await pub(cid);
    check(done.ok && done.atProvider && pc.status === "blocked", "an accepted provider cancel blocks the publication", pc.lastError ?? "");
    await due(cid);
    const stale = await executePublication(cid);
    check(stale.status === "skipped", "a stale job for the cancelled post does nothing");
    await prisma.contentItem.update({ where: { id: c.id }, data: { status: "approved" } }); // what the cancel route does
    const again = await attemptPublication({ contentItemId: c.id, workspaceId: ws.id, connectionId: conn.id, mode: "now" });
    const pAgain = await pub(again.publicationId!);
    check(pAgain.id !== cid && pAgain.idempotencyKey !== (await pub(cid)).idempotencyKey, "publishing again after a cancel is a new delivery with a new key", pAgain.idempotencyKey);

    // 5. Cancel before anything was sent: local only, provider untouched.
    const d = await approved("Scheduled later");
    await attemptPublication({ contentItemId: d.id, workspaceId: ws.id, connectionId: conn.id, mode: "schedule", scheduledFor: new Date(Date.now() + 3600_000) });
    script.calls.length = 0;
    const local = await cancelPendingPublication(d.id, ws.id, user.id);
    check(local.ok && !local.atProvider && script.calls.length === 0, "a not-yet-sent schedule is cancelled without calling the provider");

    // 6. Confirmed without a URL → the sweep fills it from the provider.
    script.publishAnswer = "published";
    const e = await approved("Confirmed without URL");
    const re = await attemptPublication({ contentItemId: e.id, workspaceId: ws.id, connectionId: conn.id, mode: "now" });
    let pe = await pub(re.publicationId!);
    check(re.ok && pe.status === "published" && pe.externalUrl === null, "confirmed with no URL yet");
    script.status.set(pe.externalId!, { state: "published", url: "https://www.linkedin.com/feed/update/urn:li:share:43/" });
    const bf = await backfillPublishedUrls();
    pe = await pub(pe.id);
    check(bf.filled >= 1 && pe.externalUrl === "https://www.linkedin.com/feed/update/urn:li:share:43/", "the sweep fills the live URL", JSON.stringify(bf));
  } finally {
    await prisma.modelCall.deleteMany({ where: { workspaceId: ws.id } });
    await prisma.workspace.delete({ where: { id: ws.id } });
    await prisma.organization.deleteMany({ where: { slug: `sync-check-${stamp}` } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
  console.log(failures === 0 ? "\nAll publication sync checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
