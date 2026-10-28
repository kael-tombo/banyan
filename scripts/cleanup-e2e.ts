// Cleanup: remove E2E test goals/campaigns/facts so the user starts fresh.
// Run with: npx tsx scripts/cleanup-e2e.ts
import { prisma } from "../src/lib/db";

async function main() {
  const goals = await prisma.goal.findMany({ select: { id: true } });
  console.log(`removing ${goals.length} test goal(s)`);
  // Campaigns created by the agent workflows for these goals
  const campaigns = await prisma.campaign.findMany({ where: { goalId: { not: null } }, select: { id: true } });
  for (const c of campaigns) {
    await prisma.contentItem.deleteMany({ where: { campaignId: c.id } });
    await prisma.campaignMetric.deleteMany({ where: { campaignId: c.id } });
    await prisma.experiment.deleteMany({ where: { campaignId: c.id } });
    await prisma.trackedLink.deleteMany({ where: { campaignId: c.id } });
    await prisma.campaign.delete({ where: { id: c.id } });
  }
  await prisma.agentTask.deleteMany({ where: { goalId: { not: null } } });
  await prisma.goalPlan.deleteMany({});
  await prisma.goal.deleteMany({});
  await prisma.profileFact.deleteMany({});
  await prisma.modelCall.deleteMany({});
  await prisma.activityEvent.deleteMany({ where: { type: { in: ["goal", "plan", "task"] } } });
  console.log("cleanup complete");
}

main().finally(() => prisma.$disconnect());
