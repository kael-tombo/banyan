import { routedProvider } from "@/lib/model/router";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { randomSlug } from "@/lib/crypto";
import { generateDraftPlan } from "@/lib/ai/generate";
import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/permissions";
import { markStage } from "@/lib/onboarding/progress";
import { isValidTimeZone } from "@/lib/onboarding/stages";

const BUSINESS_MODELS = ["saas", "marketplace", "ecommerce", "services", "app", "other"] as const;

const stepSchema = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("workspace"),
    data: z.object({
      workspaceName: z.string().trim().min(1).max(80),
      businessName: z.string().trim().min(1).max(120),
      industry: z.string().trim().min(2).max(80),
      businessModel: z.enum(BUSINESS_MODELS),
      timeZone: z.string().trim().min(1).max(60).refine(isValidTimeZone, "Unknown time zone."),
    }),
  }),
  z.object({
    step: z.literal("product"),
    data: z.object({
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().min(10).max(2000),
      website: z.union([z.string().trim().url().max(300), z.literal("")]).optional(),
      stage: z.enum(["idea", "building", "private_beta", "public_beta", "launched", "growth"]),
      problem: z.string().trim().min(10).max(1000),
      valueProp: z.string().trim().min(10).max(500),
    }),
  }),
  z.object({
    step: z.literal("audience"),
    data: z.object({
      audience: z.string().trim().min(3).max(300),
      pain: z.string().trim().min(5).max(500),
      outcome: z.string().trim().min(5).max(500),
      geography: z.union([z.string().trim().max(200), z.literal("")]).optional(),
    }),
  }),
  z.object({
    step: z.literal("goal"),
    data: z.object({
      goal: z.enum(["first_users", "launch", "audience", "leads", "activation", "conversions"]),
      goalTarget: z.number().int().min(0).max(1_000_000).nullable().optional(),
      goalMetric: z.union([z.string().trim().max(120), z.literal("")]).optional(),
    }),
  }),
  z.object({
    step: z.literal("channels"),
    data: z.object({ channels: z.array(z.enum(["x", "linkedin", "shortvideo"])).min(1).max(3) }),
  }),
  z.object({
    step: z.literal("voice"),
    data: z.object({
      tone: z.string().trim().min(3).max(200),
      language: z.string().trim().min(2).max(60),
      themes: z.union([z.string().trim().max(500), z.literal("")]).optional(),
      avoid: z.union([z.string().trim().max(500), z.literal("")]).optional(),
      cta: z.union([z.string().trim().max(200), z.literal("")]).optional(),
      approvalPreference: z.enum(["manual_everything", "manual_external_only"]).default("manual_everything"),
    }),
  }),
]);

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);

  const parsed = await readJson(req, stepSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);

  const { step, data } = parsed.data;

  // US-019: workspace basics live on the workspace, not the product profile.
  if (step === "workspace") {
    await prisma.workspace.update({
      where: { id: ctx.workspace.id },
      data: {
        name: data.workspaceName,
        businessName: data.businessName,
        industry: data.industry,
        businessModel: data.businessModel,
        timeZone: data.timeZone,
      },
    });
    await markStage(ctx.workspace.id, "workspace", "done");
    return json({ ok: true, step });
  }

  const existing = await prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } });

  const update: Prisma.ProductProfileUpdateInput = { workspace: { connect: { id: ctx.workspace.id } } };

  if (step === "product") {
    update.name = data.name;
    update.description = data.description;
    update.website = data.website ?? (existing?.website ?? "");
    update.stage = data.stage;
    update.problem = data.problem;
    update.valueProp = data.valueProp;
  }
  if (step === "audience") {
    update.audience = data.audience;
    // Recorded as an explicit low-confidence assumption until validated.
    await prisma.audienceInsight.create({
      data: {
        workspaceId: ctx.workspace.id,
        title: "Observed audience hypothesis (onboarding)",
        body:`Who: ${data.audience}. Pain: ${data.pain}. Desired outcome: ${data.outcome}.
Geography/market: ${data.geography || "not specified"}`,
        source: "assumption",
        confidence: "low",
      },
    });
  }
  if (step === "goal") {
    update.goal = data.goal;
    update.goalTarget = data.goalTarget ?? null;
    update.goalMetric = data.goalMetric ?? (existing?.goalMetric ?? "");
  }
  if (step === "channels") {
    update.channels = JSON.stringify(data.channels);
  }
  if (step === "voice") {
    update.brandVoice = JSON.stringify(data);
  }

  const saved = await prisma.productProfile.upsert({
    where: { workspaceId: ctx.workspace.id },
    create: {
      workspaceId: ctx.workspace.id,
      name: (update.name as string) ?? "",
      description: (update.description as string) ?? "",
      website: (update.website as string) ?? "",
      stage: (update.stage as string) ?? "",
      problem: (update.problem as string) ?? "",
      valueProp: (update.valueProp as string) ?? "",
      audience: (update.audience as string) ?? "",
      goal: (update.goal as string) ?? "",
      channels: (update.channels as string) ?? "[]",
      brandVoice: (update.brandVoice as string) ?? "{}",
    },
    update,
  });

  // US-018: record which stages this save completes.
  if (step === "product" && saved.website) await markStage(ctx.workspace.id, "product_url", "done");
  if (saved.name && saved.description && saved.audience && saved.goal) await markStage(ctx.workspace.id, "business", "done");
  if (step === "channels") await markStage(ctx.workspace.id, "preferences", "done");
  if (step === "voice") await markStage(ctx.workspace.id, "brand", "done");

  return json({ ok: true, step });
}

/** Generate the first draft plan (onboarding step 6). Always labeled as hypotheses. */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const profile = await prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } });
  if (!profile) return apiError("Complete steps 1–5 first.", 409);

  const result = await generateDraftPlan({
    provider: routedProvider({ workspaceId: ctx.workspace.id, purpose: "plan_draft" }),
    productName: profile.name,
    productDescription: profile.description,
    problem: profile.problem,
    valueProp: profile.valueProp,
    stage: profile.stage,
    audience: profile.audience ?? "",
    audiencePain: profile.goalMetric ?? "",
    audienceOutcome: profile.goalMetric ?? "",
    goal: profile.goal ?? "first_users",
    goalTarget: profile.goalTarget,
    channels: JSON.parse(profile.channels || "[]"),
  });

  const planId = `plan-${randomSlug(6)}`;
  await prisma.activityEvent.create({
    data: {
      workspaceId: ctx.workspace.id,
      type: "campaign",
      actorType: "ai",
      actorSummary: result.label,
      summary: `Draft distribution plan generated (${planId}). All items are hypotheses pending human review.`,
      meta: JSON.stringify({ plan: result.plan, planId, isFallback: result.isFallback }),
    },
  });

  return json({ plan: result.plan, isFallback: result.isFallback, label: result.label, planId });
}
