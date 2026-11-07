import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

const STAGES = ["idea", "building", "private_beta", "public_beta", "launched", "growth"] as const;
const CHANNELS = ["x", "linkedin", "shortvideo"] as const;

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(10).max(2000),
  website: z.union([z.string().trim().url().max(300), z.literal("")]).optional(),
  stage: z.enum(STAGES),
  problem: z.string().trim().min(10).max(1000),
  valueProp: z.string().trim().min(10).max(500),
  audience: z.string().trim().min(2).max(300),
  audiencePain: z.string().trim().max(1000).optional(),
  audienceOutcome: z.string().trim().max(1000).optional(),
  sourceUrl: z.union([z.string().trim().url().max(300), z.literal("")]).optional(),
  channels: z.array(z.enum(CHANNELS)).min(1).max(3).optional(),
  // What onboarding read from the site and the founder reviewed. Each is saved
  // only when sent, so a form that does not show it never erases it.
  positioning: z.string().trim().max(500).optional(),
  category: z.string().trim().max(120).optional(),
  pricing: z.string().trim().max(600).optional(),
  tone: z.string().trim().max(80).optional(),
  primaryCta: z.string().trim().max(100).optional(),
  features: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
  differentiators: z.array(z.string().trim().min(1).max(300)).max(6).optional(),
  problemsSolved: z.array(z.string().trim().min(1).max(300)).max(6).optional(),
  proof: z.array(z.string().trim().min(1).max(300)).max(8).optional(),
  // Onboarding 360: the analysis this came from, and the market findings the founder kept.
  analysisId: z.string().trim().max(64).optional(),
  competitors: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        url: z.string().trim().max(300).optional().default(""),
        tagline: z.string().trim().max(300).optional().default(""),
        verified: z.boolean().optional().default(false),
        source: z.enum(["named_on_site", "suggested", "added"]).optional().default("added"),
      }),
    )
    .max(8)
    .optional(),
  opportunities: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(140),
        rationale: z.string().trim().max(600),
        firstStep: z.string().trim().max(300).optional().default(""),
        confidence: z.enum(["low", "medium", "high"]).optional().default("low"),
        evidence: z.array(z.object({ label: z.string().trim().max(300), url: z.string().trim().max(500).optional() })).max(8).optional().default([]),
      }),
    )
    .max(6)
    .optional(),
});

/**
 * Save the founder-reviewed snapshot before a cycle starts. This is the moment
 * an observation becomes user-provided business context: every field is
 * overwritten with provenance `user_provided`, so a page reading can never
 * masquerade as a verified market fact later.
 */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "product-snapshot", 20, 60_000);
  if (limited) return limited;

  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);

  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const d = parsed.data;
  const website = d.website || d.sourceUrl || null;
  const source = d.sourceUrl ? `cycle intake: ${d.sourceUrl}` : "cycle intake";
  const channelsJson = d.channels ? JSON.stringify(d.channels) : null;
  const current = await prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id }, select: { brandVoice: true } });
  // Tone and call to action join the brand voice the writer already reads; other voice settings are kept.
  const voice = (() => {
    try {
      return JSON.parse(current?.brandVoice || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  if (d.tone) voice.tone = d.tone;
  if (d.primaryCta) voice.cta = d.primaryCta;
  const extra: Record<string, string | null> = {};
  if (d.positioning !== undefined) extra.positioning = d.positioning || null;
  if (d.category !== undefined) extra.market = d.category || null;
  if (d.pricing !== undefined) extra.pricing = d.pricing || null;
  if (d.features !== undefined) extra.features = JSON.stringify(d.features);
  if (d.differentiators !== undefined) extra.differentiators = JSON.stringify(d.differentiators);
  if (d.problemsSolved !== undefined) extra.problemsSolved = JSON.stringify(d.problemsSolved);
  if (d.proof !== undefined) extra.proofPoints = JSON.stringify(d.proof);
  if (d.tone !== undefined || d.primaryCta !== undefined) extra.brandVoice = JSON.stringify(voice);
  if (d.analysisId) {
    // Only an analysis of this workspace may be linked.
    const owned = await prisma.productAnalysis.findFirst({ where: { id: d.analysisId, workspaceId: ctx.workspace.id }, select: { id: true } });
    if (owned) extra.lastAnalysisId = owned.id;
  }

  await prisma.productProfile.upsert({
    where: { workspaceId: ctx.workspace.id },
    create: {
      workspaceId: ctx.workspace.id,
      name: d.name,
      description: d.description,
      website,
      stage: d.stage,
      problem: d.problem,
      valueProp: d.valueProp,
      audience: d.audience,
      audiencePain: d.audiencePain || null,
      audienceOutcome: d.audienceOutcome || null,
      ...(channelsJson ? { channels: channelsJson } : {}),
      ...extra,
      // The founder reviewed and corrected this snapshot before submitting it:
      // every field is theirs and this submission is the approval (US-023).
      fieldSources: JSON.stringify(Object.fromEntries(["name", "description", "valueProp", "problem", "audience", ...Object.keys(extra).filter((k) => k !== "lastAnalysisId" && k !== "brandVoice")].map((k) => [k, "user"]))),
      approvedAt: new Date(),
      approvedById: ctx.user.id,
    },
    update: {
      name: d.name,
      description: d.description,
      website,
      stage: d.stage,
      problem: d.problem,
      valueProp: d.valueProp,
      audience: d.audience,
      audiencePain: d.audiencePain || null,
      audienceOutcome: d.audienceOutcome || null,
      ...(channelsJson ? { channels: channelsJson } : {}),
      ...extra,
      // The founder reviewed and corrected this snapshot before submitting it:
      // every field is theirs and this submission is the approval (US-023).
      fieldSources: JSON.stringify(Object.fromEntries(["name", "description", "valueProp", "problem", "audience", ...Object.keys(extra).filter((k) => k !== "lastAnalysisId" && k !== "brandVoice")].map((k) => [k, "user"]))),
      approvedAt: new Date(),
      approvedById: ctx.user.id,
    },
  });

  const facts: { category: string; key: string; value: string }[] = [
    { category: "product", key: "name", value: d.name },
    { category: "product", key: "description", value: d.description },
    { category: "product", key: "stage", value: d.stage },
    { category: "product", key: "problem", value: d.problem },
    { category: "product", key: "value_prop", value: d.valueProp },
    { category: "audience", key: "primary", value: d.audience },
    ...(website ? [{ category: "product", key: "website", value: website }] : []),
    ...(d.audiencePain ? [{ category: "audience", key: "pain", value: d.audiencePain }] : []),
    ...(d.audienceOutcome ? [{ category: "audience", key: "outcome", value: d.audienceOutcome }] : []),
    ...(d.channels ? [{ category: "constraint", key: "channels", value: d.channels.join(", ") }] : []),
  ];

  for (const fact of facts) {
    await prisma.profileFact.upsert({
      where: {
        workspaceId_category_key: {
          workspaceId: ctx.workspace.id,
          category: fact.category,
          key: fact.key,
        },
      },
      create: {
        workspaceId: ctx.workspace.id,
        ...fact,
        provenance: "user_provided",
        source,
        confidence: "medium",
        createdBy: ctx.user.id,
      },
      update: {
        value: fact.value,
        provenance: "user_provided",
        source,
        confidence: "medium",
      },
    });
  }

  // Competitors the founder kept. A competitor Banyan read on its own site is an
  // external observation; one the founder added is theirs; a suggestion Banyan
  // could not confirm stays a hypothesis.
  if (d.competitors) {
    await prisma.profileFact.deleteMany({ where: { workspaceId: ctx.workspace.id, category: "competitor", source: "onboarding 360" } });
    for (const c of d.competitors) {
      const key = `competitor:${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "unnamed"}`;
      const value = [c.name, c.url && `(${c.url})`, c.tagline && `— ${c.tagline}`].filter(Boolean).join(" ").slice(0, 500);
      const provenance = c.source === "added" ? "user_provided" : c.verified ? "external_observation" : "hypothesis";
      await prisma.profileFact.upsert({
        where: { workspaceId_category_key: { workspaceId: ctx.workspace.id, category: "competitor", key } },
        create: { workspaceId: ctx.workspace.id, category: "competitor", key, value, provenance, source: "onboarding 360", confidence: c.verified ? "high" : "low", createdBy: ctx.user.id },
        update: { value, provenance, source: "onboarding 360", confidence: c.verified ? "high" : "low" },
      });
    }
  }

  // Opportunities the founder kept become open recommendations, each with its evidence.
  if (d.opportunities) {
    await prisma.recommendation.deleteMany({ where: { workspaceId: ctx.workspace.id, producedBy: "agent:onboarding", status: "open" } });
    if (d.opportunities.length) {
      await prisma.recommendation.createMany({
        data: d.opportunities.map((o) => ({
          workspaceId: ctx.workspace.id,
          title: o.title,
          rationale: o.firstStep ? `${o.rationale} First step: ${o.firstStep}` : o.rationale,
          evidence: JSON.stringify(o.evidence.map((e) => ({ source: e.url ?? "onboarding", summary: e.label }))),
          confidence: o.confidence,
          uncertainty: "",
          producedBy: "agent:onboarding",
        })),
      });
    }
  }

  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "campaign",
    summary: `Product snapshot reviewed and saved for a distribution cycle: ${d.name}.`,
    meta: { sourceUrl: d.sourceUrl || null, channels: d.channels ?? [] },
  });

  return json({ ok: true });
}
