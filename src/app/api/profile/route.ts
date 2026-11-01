import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, parseJson, requireWorkspace, readJson } from "@/lib/api-utils";
import { recordActivity, recordMetricEvent } from "@/lib/activity";
import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { approvalState, editBump, markUserFields } from "@/lib/product/profile-review";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(10).max(2000),
  website: z.union([z.string().trim().url().max(300), z.literal("")]).optional(),
  stage: z.enum(["idea", "building", "private_beta", "public_beta", "launched", "growth"]),
  problem: z.string().trim().min(10).max(1000),
  valueProp: z.string().trim().min(10).max(500),
  audience: z.string().trim().max(300).optional(),
  goal: z.enum(["first_users", "launch", "audience", "leads", "activation", "conversions", ""]).optional(),
  goalTarget: z.number().int().min(0).max(1_000_000).nullable().optional(),
  goalMetric: z.union([z.string().trim().max(120), z.literal("")]).optional(),
  timezone: z.string().trim().max(60).optional(),
  channels: z.array(z.enum(["x", "linkedin", "shortvideo"])).min(1).max(3).optional(),
  brandVoice: z
    .object({
      tone: z.string().trim().min(1).max(200),
      language: z.string().trim().min(1).max(60),
      themes: z.string().trim().max(500).optional().or(z.literal("")),
      avoid: z.string().trim().max(500).optional().or(z.literal("")),
      cta: z.string().trim().max(200).optional().or(z.literal("")),
      approvalPreference: z.enum(["manual_everything", "manual_external_only"]).default("manual_everything"),
    })
    .optional(),
});

const brandVoiceUpdate = z.object({
  brandVoice: z.object({
    tone: z.string().trim().min(1).max(200),
    language: z.string().trim().min(1).max(60),
    themes: z.string().trim().max(500).optional().or(z.literal("")),
    avoid: z.string().trim().max(500).optional().or(z.literal("")),
    cta: z.string().trim().max(200).optional().or(z.literal("")),
    approvalPreference: z.enum(["manual_everything", "manual_external_only"]).default("manual_everything"),
  }),
});

/** GET: read the workspace's product profile (read-only, own workspace only). */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const profile = await prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } });
  if (!profile) return apiError("No product profile yet — complete onboarding first.", 404);
  return json({
    profile: {
      ...profile,
      channels: profile.channels ? safeParse(profile.channels) : [],
      brandVoice: profile.brandVoice ? safeParse(profile.brandVoice) : null,
      features: safeParse(profile.features) ?? [],
      problemsSolved: safeParse(profile.problemsSolved) ?? [],
      differentiators: safeParse(profile.differentiators) ?? [],
      missingInformation: safeParse(profile.missingInformation) ?? [],
      fieldSources: safeParse(profile.fieldSources) ?? {},
    },
    approval: approvalState(profile),
  });
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** PATCH: update product profile. */
export async function PATCH(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);

  const rawJson = await readJson(req, z.unknown());
  if (!rawJson.ok) return apiError(rawJson.message, rawJson.status);
  const raw = rawJson.data;
  // Brand-voice-only updates are also supported on this endpoint.
  const voiceOnly = raw && typeof raw === "object" && "brandVoice" in raw && Object.keys(raw).length === 1;
  const parsed = parseJson(voiceOnly ? brandVoiceUpdate : schema, raw);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const data = voiceOnly ? { brandVoice: parsed.data.brandVoice } : parsed.data;
  const update: Prisma.ProductProfileUpdateManyMutationInput = {
    ...("brandVoice" in data ? { brandVoice: JSON.stringify((data as { brandVoice: unknown }).brandVoice) } : {}),
  };

  if (!voiceOnly) {
    const d = parsed.data as z.infer<typeof schema>;
    Object.assign(update, {
      name: d.name,
      description: d.description,
      website: d.website ?? "",
      stage: d.stage,
      problem: d.problem,
      valueProp: d.valueProp,
      ...(d.audience ? { audience: d.audience } : {}),
      ...(d.goal ? { goal: d.goal } : {}),
      ...(d.goalTarget !== undefined ? { goalTarget: d.goalTarget } : {}),
      ...(d.goalMetric !== undefined ? { goalMetric: d.goalMetric } : {}),
      ...(d.timezone ? { timezone: d.timezone } : {}),
      ...(d.channels ? { channels: JSON.stringify(d.channels) } : {}),
    });
  }

  // US-023 / US-020: whatever the founder edits is theirs; editing an approved
  // profile starts a new version that needs approving again.
  const before = await prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } });
  if (before && !voiceOnly) {
    const edited = ["name", "description", "valueProp", "problem", "audience"].filter((f) => f in (parsed.data as object));
    Object.assign(update, { fieldSources: markUserFields(before.fieldSources, edited), ...editBump(before) });
  }
  await prisma.productProfile.updateMany({ where: { workspaceId: ctx.workspace.id }, data: update });
  await recordActivity({ workspaceId: ctx.workspace.id, type: "campaign", summary: "Product profile updated." });
  return json({ ok: true });
}

/** POST: mark onboarding complete (optionally applying a reviewed plan). */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);

  const parsed = await readJson(
    req,
    z.object({
      planId: z.string().optional(),
    })
  );
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const user = ctx.user;

  await prisma.user.update({ where: { id: user.id }, data: { onboardingCompletedAt: new Date() } });
  await recordMetricEvent({
    workspaceId: ctx.workspace.id,
    type: "onboarding_complete",
    userId: user.id,
  });
  await recordActivity({ workspaceId: ctx.workspace.id, type: "onboarding_complete", summary: "Onboarding completed." });
  return json({ ok: true, next: "/app" });
}

type PrismaProductProfileUpdate = Parameters<typeof prisma.productProfile.updateMany>[0]["data"];
