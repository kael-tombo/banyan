import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

/**
 * Shared demo seeding — used by two callers:
 *  1. `prisma/seed.ts` (`npm run db:seed` / `npm run setup`) on durable hosts.
 *  2. The runtime bootstrap (`src/lib/bootstrap/runtime-bootstrap.ts`) on
 *     throwaway-filesystem hosts (serverless), where the database is fresh
 *     on every cold start and no migrate/seed step can ever have run.
 *
 * Creates the demo founder account and Banyan.ai's own first workspace.
 * Banyan.ai is its own first customer: this workspace contains real product
 * context and a starter distribution goal so the product can be used to
 * distribute itself. It intentionally contains NO fabricated results — no
 * impressions, clicks, signups, publications or metrics are invented here.
 */
export async function seedDemoDatabase(prisma: PrismaClient): Promise<{ email: string }> {
  const email = (process.env.SEED_USER_EMAIL || "founder@banyan.ai").toLowerCase();
  const password = process.env.SEED_USER_PASSWORD || "banyan-demopass";

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Banyan Founder",
      passwordHash: await bcrypt.hash(password, 12),
      // Seeded accounts land directly in the app; onboarding is still available
      // to exercise by signing up with a new account.
      onboardingCompletedAt: new Date(),
    },
  });

  // Reuse the organization the seeded product already belongs to (an existing database was backfilled
  // one organization per workspace); create "Banyan" only on a fresh database.
  const existingProduct = await prisma.workspace.findUnique({ where: { slug: "banyan-ai" }, select: { organizationId: true } });
  const organization = existingProduct
    ? await prisma.organization.findUniqueOrThrow({ where: { id: existingProduct.organizationId } })
    : await prisma.organization.upsert({ where: { slug: "banyan" }, update: { name: "Banyan" }, create: { name: "Banyan", slug: "banyan" } });
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    update: { role: "OWNER" },
    create: { organizationId: organization.id, userId: user.id, role: "OWNER" },
  });
  const workspace = await prisma.workspace.upsert({
    where: { slug: "banyan-ai" },
    update: { name: "Banyan.ai", isSelf: true },
    create: { name: "Banyan.ai", slug: "banyan-ai", isSelf: true, organizationId: organization.id, productType: "saas" },
  });

  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    update: { role: "owner" },
    create: { userId: user.id, workspaceId: workspace.id, role: "owner" },
  });

  // Clear previously-seeded workspace content so re-running the seed is idempotent.
  // Campaigns cascade to their content items, metrics, experiments and links.
  await prisma.experiment.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.campaign.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.audienceInsight.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.metricEvent.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.activityEvent.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.productProfile.deleteMany({ where: { workspaceId: workspace.id } });

  await prisma.productProfile.create({
    data: {
      workspaceId: workspace.id,
      name: "Banyan.ai",
      description:
        "The agentic operating system for product distribution. Banyan.ai coordinates research, strategy, content, publishing and learning so founders can turn a product into measurable growth experiments.",
      website: "http://localhost:3000",
      stage: "building",
      problem:
        "Founders build products faster than they can find the people who need them, and distribution is usually improvised, unmeasured, and abandoned after a few posts.",
      valueProp:
        "Banyan.ai turns distribution into a system: an inspectable plan, channel-appropriate content with human approval, real publishing, and evidence-backed learning that feeds the next experiment.",
      audience: "Solo founders and small product teams taking a first product to market.",
      audiencePain: "They publish inconsistently and cannot tell which message or channel produced real interest.",
      audienceOutcome: "A repeatable distribution loop that produces qualified visits and signups with evidence.",
      market: "AI marketing / growth tooling",
      goal: "first_users",
      goalTarget: 100,
      goalMetric: "qualified signups",
      positioning:
        "Hypothesis: founders want distribution treated as an operating system — planned, approved, measured — not another content generator.",
      channels: JSON.stringify(["x", "linkedin", "shortvideo"]),
      brandVoice: JSON.stringify({
        tone: "direct, plain-spoken, evidence-first",
        language: "English",
        themes: "build in public, distribution systems, honest metrics, hypothesis-driven experiments",
        avoid: "hype, fabricated results, competitor bashing, growth-hack clichés",
        cta: "Try Banyan.ai and tell us what is missing",
        approvalPreference: "manual_everything",
      }),
      timezone: "UTC",
    },
  });

  await prisma.audienceInsight.createMany({
    data: [
      {
        workspaceId: workspace.id,
        title: "Founders distribute reactively, not systematically",
        body: "Hypothesis: most founders decide what to post the same day, with no campaign objective, audience or success metric attached. Validate by interviewing 5 founders about their last 3 posts.",
        source: "assumption",
        confidence: "low",
      },
      {
        workspaceId: workspace.id,
        title: "Approval is a feature, not friction, for early users",
        body: "Hypothesis: founders building in public want a human approval step before anything publishes under their name — they will not accept fully autonomous posting on day one.",
        source: "assumption",
        confidence: "low",
      },
      {
        workspaceId: workspace.id,
        title: "Honest measurement is a differentiator",
        body: "Hypothesis: founders distrust dashboards that show invented engagement, so clearly labelling missing/provider-unavailable data builds trust rather than looking empty.",
        source: "assumption",
        confidence: "low",
      },
    ],
  });

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      name: "Validate Banyan.ai positioning with founders",
      objective:
        "Test whether the positioning 'distribution as an operating system, not a content generator' earns qualified interest from solo founders.",
      targetAudience: "Solo founders and small product teams pre-launch or in early growth.",
      keyMessage:
        "Hypothesis: your distribution problem is not a content problem — it is a missing system. Banyan.ai plans, gets your approval, publishes, and measures.",
      evidence: "", // No claims are allowed until the founder supplies real evidence.
      cta: "Try Banyan.ai and tell us what is missing",
      channels: JSON.stringify(["x", "linkedin"]),
      formats: JSON.stringify(["single", "thread", "insight"]),
      schedule: JSON.stringify({ cadence: "3 posts/week", notes: "Review cadence after the first two weeks of data." }),
      successMetric: "Tracked clicks to signup page → signups attributed to this campaign",
      status: "planned",
      isSelfCampaign: true,
      selfTheme: "positioning validation",
    },
  });

  await prisma.experiment.create({
    data: {
      workspaceId: workspace.id,
      campaignId: campaign.id,
      title: "Problem-first vs product-first openings",
      hypothesis:
        "Hypothesis: posts that open with the audience's problem earn more qualified clicks than posts that open with the product.",
      audience: "Solo founders pre-launch",
      channel: "x",
      variable: "Opening angle (problem-first vs product-first)",
      successMetric: "Tracked clicks from campaign links",
      status: "planned",
    },
  });

  await prisma.activityEvent.createMany({
    data: [
      {
        workspaceId: workspace.id,
        type: "campaign",
        actorType: "ai",
        actorSummary: "Seed",
        summary: `Seeded Banyan.ai's self-distribution workspace with campaign "${campaign.name}". No results are recorded until they are actually observed.`,
      },
      {
        workspaceId: workspace.id,
        type: "experiment_update",
        actorType: "ai",
        actorSummary: "Seed",
        summary: "Seeded one planned experiment: problem-first vs product-first openings.",
      },
    ],
  });

  console.log(`[seed] Workspace "${workspace.name}" (${workspace.slug}) ready for ${email}.`);
  return { email };
}
