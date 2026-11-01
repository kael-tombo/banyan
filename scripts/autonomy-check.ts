/**
 * Supervised autonomy against a real database: a throwaway workspace with a
 * supervised policy, four drafts, one supervision pass, then every decision
 * checked. Deletes everything it created.
 *
 *   npx tsx --env-file=.env scripts/autonomy-check.ts
 */
import { prisma } from "@/lib/db";
import { setPolicy, superviseDrafts, autonomyEvents } from "@/lib/autonomy/service";

async function main() {
  let failures = 0;
  const check = (ok: boolean, label: string, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
  };
  const stamp = Date.now();
  const user = await prisma.user.create({ data: { email: `autonomy-${stamp}@check.local`, name: "Autonomy Check" } });
  const ws = await prisma.workspace.create({ data: { name: "autonomy-check", slug: `ac-${stamp}`, timeZone: "Europe/Paris" } });
  try {
    await prisma.membership.create({ data: { userId: user.id, workspaceId: ws.id, role: "owner" } });
    const campaign = await prisma.campaign.create({
      data: { workspaceId: ws.id, name: "Check", objective: "signups", targetAudience: "founders", keyMessage: "k", cta: "Try it", successMetric: "signups" },
    });
    // LinkedIn has published through a provider before, so the first-post rule does not apply to it.
    const earlier = await prisma.contentItem.create({ data: { workspaceId: ws.id, channel: "linkedin", format: "post", title: "Earlier", body: "earlier", status: "published" } });
    await prisma.publication.create({ data: { contentItemId: earlier.id, provider: "socialflow", status: "published", publishedAt: new Date(), idempotencyKey: `ac-${stamp}-earlier` } });

    const draft = (channel: string, title: string, isFallback = false) =>
      prisma.contentItem.create({
        data: {
          workspaceId: ws.id, campaignId: campaign.id, channel, format: "post", title, body: `${title} body`, status: "ready_for_review",
          checks: "[]", generationMeta: JSON.stringify({ provider: isFallback ? "template-fallback" : "model", isFallback }),
        },
      });
    const clean = await draft("linkedin", "Clean LinkedIn post");
    const fallback = await draft("linkedin", "Template LinkedIn post", true);
    const video = await draft("shortvideo", "Video script");
    const x = await draft("x", "X post");

    // Off by default: nothing happens.
    const off = await superviseDrafts(ws.id, campaign.id);
    check(off.approved === 0 && off.escalated === 0, "approve-each policy does nothing");

    const policy = await setPolicy(ws.id, user, { level: "supervised", channels: ["linkedin"], maxPerDay: 2, quietHours: null, blackoutDates: [], autoPublish: true });
    check(policy.version === 1 && policy.setById === user.id, "policy v1 recorded with the founder who set it");

    // Paused agents do nothing even when supervised.
    await prisma.workspace.update({ where: { id: ws.id }, data: { agentsPausedAt: new Date() } });
    const paused = await superviseDrafts(ws.id, campaign.id);
    check(paused.approved === 0 && paused.escalated === 0, "paused agents do nothing");
    await prisma.workspace.update({ where: { id: ws.id }, data: { agentsPausedAt: null } });

    const r = await superviseDrafts(ws.id, campaign.id);
    check(r.approved === 1 && r.escalated === 3, "one approved, three escalated", JSON.stringify(r));

    const after = Object.fromEntries((await prisma.contentItem.findMany({ where: { id: { in: [clean.id, fallback.id, video.id, x.id] } } })).map((i) => [i.id, i]));
    check(after[clean.id].status === "approved" && after[clean.id].approvedById === user.id, "the clean draft is approved, attributed to the founder");
    for (const [id, name] of [[fallback.id, "template draft"], [video.id, "video"], [x.id, "X (not an autopilot channel)"]] as const) {
      check(after[id].status === "ready_for_review" && !after[id].approvedById, `the ${name} still waits for review`);
    }

    const events = await autonomyEvents(ws.id, new Date(stamp - 60_000));
    const byItem = (id: string) => events.filter((e) => e.contentItemId === id).map((e) => e.decision);
    check(byItem(clean.id).includes("auto_approved"), "approval is logged");
    check(byItem(clean.id).includes("not_scheduled"), "no verified connection: logged as approved but not scheduled");
    const reason = (id: string) => events.find((e) => e.contentItemId === id && e.decision === "escalated")?.reasons.join(" ") ?? "";
    check(/template fallback/.test(reason(fallback.id)), "the template draft says why", reason(fallback.id));
    check(/always published by you/.test(reason(video.id)), "the video says why", reason(video.id));
    check(/not one of your autopilot channels/.test(reason(x.id)) && /first post on X/.test(reason(x.id)), "the X post gives both reasons", reason(x.id));

    const again = await superviseDrafts(ws.id, campaign.id);
    check(again.approved === 0, "a second pass does not approve anything twice");
  } finally {
    await prisma.workspace.delete({ where: { id: ws.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
