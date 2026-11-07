/**
 * The weekly autopilot summary against a real database: a throwaway supervised
 * workspace with a confirmed owner and one week of decisions. Sends the summary,
 * checks a second sweep does not send it again, unsubscribes through the
 * one-click endpoint of a running app (BASE_URL), and checks next week sends
 * nothing. Deletes everything it created.
 *
 *   BASE_URL=http://localhost:3000 npx tsx --env-file=.env scripts/digest-check.ts
 */
import { prisma } from "@/lib/db";
import { setPolicy, superviseDrafts } from "@/lib/autonomy/service";
import { sendDueAutonomyDigests } from "@/lib/autonomy/digest-email";
import { oneClickUnsubscribeUrl } from "@/lib/email/preferences";

async function main() {
  let failures = 0;
  const check = (ok: boolean, label: string, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
  };
  const stamp = Date.now();
  const user = await prisma.user.create({ data: { email: `digest-${stamp}@check.local`, name: "Digest Check", emailVerifiedAt: new Date() } });
  const ws = await prisma.workspace.create({ data: { organization: { create: { name: "digest-check", slug: `digest-check-${stamp}` } }, name: "Digest Check Co", slug: `dc-${stamp}`, timeZone: "UTC" } });
  try {
    await prisma.membership.create({ data: { userId: user.id, workspaceId: ws.id, role: "owner" } });
    const campaign = await prisma.campaign.create({ data: { workspaceId: ws.id, name: "C", objective: "signups", targetAudience: "f", keyMessage: "k", cta: "c", successMetric: "s" } });
    const earlier = await prisma.contentItem.create({ data: { workspaceId: ws.id, channel: "linkedin", format: "post", title: "Earlier", body: "e", status: "published" } });
    await prisma.publication.create({ data: { contentItemId: earlier.id, provider: "socialflow", status: "published", publishedAt: new Date(), idempotencyKey: `dc-${stamp}` } });
    for (const title of ["Routine post", "A second routine post"]) {
      await prisma.contentItem.create({ data: { workspaceId: ws.id, campaignId: campaign.id, channel: "linkedin", format: "post", title, body: `${title} body`, status: "ready_for_review", checks: "[]", generationMeta: JSON.stringify({ provider: "model", isFallback: false }) } });
    }
    await setPolicy(ws.id, user, { level: "supervised", channels: ["linkedin"], maxPerDay: 2, quietHours: null, blackoutDates: [], autoPublish: false, escalateTopics: [] });
    const s = await superviseDrafts(ws.id, campaign.id);
    check(s.approved === 2, "two routine drafts approved by the policy", JSON.stringify(s));

    const now = new Date();
    await sendDueAutonomyDigests(now);
    const rows = () => prisma.emailMessage.findMany({ where: { userId: user.id, template: "autonomy_digest" } });
    const first = await rows();
    check(first.length === 1, "one summary queued for the owner", `${first.length} row(s), status ${first[0]?.status}`);
    check(["sent", "dev_logged"].includes(first[0]?.status ?? "") && first[0]?.payload === null, "delivered (or logged by the dev transport) and its content erased");

    await sendDueAutonomyDigests(new Date(now.getTime() + 60_000));
    check((await rows()).length === 1, "a second sweep in the same week sends nothing more");

    const base = process.env.BASE_URL;
    if (base) {
      const url = oneClickUnsubscribeUrl(user.id, "autonomyDigest").replace(/^https?:\/\/[^/]+/, base.replace(/\/$/, ""));
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://mail.example" }, body: "List-Unsubscribe=One-Click" });
      check(res.ok, "one-click unsubscribe from another origin (as a mail provider would) works", `HTTP ${res.status}`);
      const tampered = await fetch(url.replace(user.id, `${user.id}x`), { method: "POST" });
      check(tampered.status === 400, "a tampered link is refused", `HTTP ${tampered.status}`);
    } else {
      await prisma.user.update({ where: { id: user.id }, data: { emailPrefs: JSON.stringify({ autonomyDigest: false }) } });
      console.log("SKIP: BASE_URL not set; turned the summary off directly");
    }
    const prefs = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailPrefs;
    check(prefs === JSON.stringify({ autonomyDigest: false }), "the preference is off", prefs ?? "null");

    await sendDueAutonomyDigests(new Date(now.getTime() + 7 * 86_400_000));
    check((await rows()).length === 1, "next week, nothing is sent to someone who turned it off");
  } finally {
    await prisma.emailMessage.deleteMany({ where: { userId: user.id } });
    await prisma.organization.delete({ where: { id: ws.organizationId } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
