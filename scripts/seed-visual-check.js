/**
 * Visual-verification seed: inserts only shapes the app itself records in
 * normal operation — backdated first-party metric events (so the funnel deltas
 * and daily sparkline have a real series to render), a tracked link with
 * clicks, and scheduled/published publications tied to an approved content
 * item. Run with: node scripts/seed-visual-check.js
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const workspace = await prisma.workspace.findFirst({ where: { name: "Vision Tester's workspace" } });
  if (!workspace) throw new Error("workspace not found");
  const wid = workspace.id;
  const now = Date.now();

  // Idempotent: clear artifacts from a previous visual-check run first.
  await prisma.metricEvent.deleteMany({ where: { workspaceId: wid, link: { slug: "vis-check-1" } } });
  await prisma.trackedLink.deleteMany({ where: { workspaceId: wid, slug: "vis-check-1" } });
  await prisma.publication.deleteMany({ where: { idempotencyKey: { in: ["seed-sched-1", "seed-pub-1"] } } });
  await prisma.contentItem.deleteMany({ where: { workspaceId: wid, title: { startsWith: "Why most indie products" } } });
  await prisma.contentItem.deleteMany({ where: { workspaceId: wid, title: { startsWith: "Building in public: week 3" } } });

  // Tracked link with cumulative clicks (app records clicks via /t/[slug]).
  const link = await prisma.trackedLink.create({
    data: {
      workspaceId: wid,
      slug: "vis-check-1",
      targetUrl: "https://myproduct.io/?utm_source=linkedin",
      utm: "{}",
      clicks: 214,
      lastClickAt: new Date(now - 2 * 3600 * 1000),
    },
  });

  // Backdated visit events: current 14 days trending up, previous 14 lower.
  const currentDaily = [4, 6, 5, 9, 11, 8, 14, 17, 15, 21, 24, 22, 27, 31];
  const prevDaily = [3, 5, 4, 6, 5, 7, 6, 8, 7, 9, 8, 10, 9, 11];
  let signupsCur = 0;
  const events = [];
  currentDaily.forEach((n, i) => {
    for (let k = 0; k < n; k++) {
      events.push({ workspaceId: wid, type: "visit", linkId: link.id, createdAt: new Date(now - (13 - i) * DAY + k * 60_000) });
    }
    const s = Math.max(1, Math.round(n * 0.09));
    signupsCur += s;
    for (let k = 0; k < s; k++) {
      events.push({ workspaceId: wid, type: "signup", linkId: link.id, createdAt: new Date(now - (13 - i) * DAY + 30 * 60_000 + k * 60_000) });
    }
  });
  let prevVisits = 0;
  let prevSignups = 0;
  prevDaily.forEach((n, i) => {
    prevVisits += n;
    for (let k = 0; k < n; k++) events.push({ workspaceId: wid, type: "visit", linkId: link.id, createdAt: new Date(now - (27 - i) * DAY - 2 * DAY + k * 60_000) });
    const s = Math.max(1, Math.round(n * 0.05));
    prevSignups += s;
    for (let k = 0; k < s; k++) events.push({ workspaceId: wid, type: "signup", linkId: link.id, createdAt: new Date(now - (27 - i) * DAY - 2 * DAY + k * 60_000) });
  });
  await prisma.metricEvent.createMany({ data: events });

  // Content + publications: two scheduled, one published (manual handoff shape).
  const content = await prisma.contentItem.create({
    data: {
      workspaceId: wid,
      channel: "linkedin",
      format: "post",
      title: "Why most indie products fail at distribution (and how to fix it)",
      body: "Problem-led LinkedIn post drafted from the workspace context.",
      status: "scheduled",
      approvedAt: new Date(now - DAY),
      approvedById: null,
    },
  });
  const content2 = await prisma.contentItem.create({
    data: {
      workspaceId: wid,
      channel: "x",
      format: "thread",
      title: "Building in public: week 3 — what the funnel taught us",
      body: "Founder update thread.",
      status: "published",
      approvedAt: new Date(now - 3 * DAY),
      approvedById: null,
    },
  });
  await prisma.publication.createMany({
    data: [
      { contentItemId: content.id, provider: "postiz", status: "scheduled", scheduledFor: new Date(now + 5 * 3600 * 1000), idempotencyKey: "seed-sched-1" },
      { contentItemId: content2.id, provider: "manual", manual: true, status: "published", publishedAt: new Date(now - 2 * DAY), idempotencyKey: "seed-pub-1" },
    ],
  });

  console.log(JSON.stringify({ link: link.id, events: events.length, signupsCur, prevVisits, prevSignups }));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
