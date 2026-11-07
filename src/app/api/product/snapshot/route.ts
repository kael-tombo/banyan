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
      fieldSources: JSON.stringify(Object.fromEntries(["name", "description", "valueProp", "problem", "audience", ...Object.keys(extra)].map((k) => [k, "user"]))),
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
      fieldSources: JSON.stringify(Object.fromEntries(["name", "description", "valueProp", "problem", "audience", ...Object.keys(extra)].map((k) => [k, "user"]))),
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

  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "campaign",
    summary: `Product snapshot reviewed and saved for a distribution cycle: ${d.name}.`,
    meta: { sourceUrl: d.sourceUrl || null, channels: d.channels ?? [] },
  });

  return json({ ok: true });
}
