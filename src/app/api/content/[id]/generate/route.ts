import { requireRole } from "@/lib/permissions";
import { assertCampaignAllowsGeneration, LifecycleError } from "@/lib/campaign/lifecycle-service";
import { routedProvider } from "@/lib/model/router";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { generateContent } from "@/lib/ai/generate";
import { priorLearningLines } from "@/lib/learning-memory";
import { isChannel, isFormatFor } from "@/lib/formats";
import { canTransitionContent } from "@/lib/state-machines";
import { recordActivity } from "@/lib/activity";
import { NextRequest } from "next/server";
import { z } from "zod";

const actionSchema = z.object({
  action: z.enum(["generate", "regenerate", "improve_hook", "shorten", "change_tone", "adapt_channel", "alternatives"]),
  targetChannel: z.enum(["x", "linkedin", "shortvideo"]).optional(),
  targetFormat: z.string().max(50).optional(),
  tone: z.string().trim().max(120).optional(),
});

async function load(id: string, workspaceId: string) {
  return prisma.contentItem.findFirst({ where: { id, workspaceId }, include: { campaign: true } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "ai-generate", 20, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);

  const { id } = await params;
  const item = await load(id, ctx.workspace.id);
  if (!item) return apiError("Content not found.", 404);
  try {
    await assertCampaignAllowsGeneration(ctx.workspace.id, item.campaignId);
  } catch (err) {
    if (err instanceof LifecycleError) return apiError(err.message, err.status);
    throw err;
  }

  // Preserve user edits: generation applies only from draft/rejected states.
  if (!canTransitionContent(item.status, "ready_for_review") || ["published", "archived", "scheduled", "approved", "ready_for_review"].includes(item.status)) {
    if (!["draft", "rejected"].includes(item.status)) {
      return apiError(
        `Generation is only available from draft or rejected states (currently: ${item.status}). Save your work and re-submit for review instead.`,
        409
      );
    }
  }

  const parsed = await readJson(req, actionSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const channel = parsed.data.targetChannel && isChannel(parsed.data.targetChannel)
    ? parsed.data.targetChannel
    : item.channel as "x" | "linkedin" | "shortvideo";
  const format = parsed.data.targetFormat ?? item.format;
  if (!isFormatFor(channel, format)) return apiError(`Format "${format}" is not valid for channel "${channel}".`, 400);

  const [profile, experiments] = await Promise.all([
    prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } }),
    prisma.experiment.findMany({
      where: { workspaceId: ctx.workspace.id, status: "complete" },
      orderBy: [{ decidedAt: "desc" }, { updatedAt: "desc" }],
      take: 8,
    }),
  ]);
  if (!profile) return apiError("Complete the workspace profile first.", 409);

  const brandVoice = JSON.parse(profile.brandVoice || "{}");
  const instructions: Record<string, string> = {
    improve_hook: "Rewrite this same content with a much stronger opening line (hook). Keep the substance.",
    shorten: "Condense this content to roughly half its length without losing the key point.",
    change_tone: `Rewrite this content in this tone instead: ${parsed.data.tone || "warmer, more conversational"}.`,
    adapt_channel: `Adapt this content for the format/formatting conventions of the channel: ${channel}.`,
    alternatives: "Offer a clearly different alternative angle for the same message.",
    regenerate: "",
    generate: "",
  };
  const instruction = instructions[parsed.data.action];

  try {
    const result = await generateContent({
      channel,
      format,
      provider: routedProvider({ workspaceId: ctx.workspace.id, purpose: "content_draft" }),
      learning: priorLearningLines(experiments, 4),
      campaign: item.campaign
        ? {
            name: item.campaign.name,
            objective: item.campaign.objective,
            targetAudience: item.campaign.targetAudience,
            keyMessage: item.campaign.keyMessage,
            evidence: item.campaign.evidence,
            cta: item.campaign.cta,
          }
        : null,
      profile: {
        name: profile.name,
        description: profile.description,
        valueProp: profile.valueProp,
        audience: profile.audience ?? "",
        positioning: profile.positioning ?? undefined,
      },
      brandVoice,
      instruction: instruction || undefined,
    });

    // Previous draft preserved as a revision before overwriting.
    await prisma.contentRevision.create({
      data: { contentItemId: item.id, title: item.title, body: item.body, note: `Snapshot before ${parsed.data.action}`, authorType: "system" },
    });

    const updated = await prisma.contentItem.update({
      where: { id: item.id },
      data: {
        channel,
        format,
        body: result.body,
        videoExtras: result.videoExtras ? JSON.stringify(result.videoExtras) : item.videoExtras,
        generationMeta: JSON.stringify({
          provider: result.provider,
          model: result.label,
          isFallback: result.isFallback,
          action: parsed.data.action,
          generatedAt: new Date().toISOString(),
        }),
      },
    });

    await recordActivity({
      workspaceId: ctx.workspace.id,
      type: "content_generated",
      actorType: "ai",
      actorSummary: result.label,
      summary: `${parsed.data.action === "generate" ? "Generated draft" : `Applied ${parsed.data.action}`} for "${item.title}" (${result.label}).`,
      meta: { contentItemId: item.id, isFallback: result.isFallback },
    });

    return json({ item: updated, isFallback: result.isFallback, label: result.label, videoExtras: result.videoExtras ?? null });
  } catch {
    // Invalid model output etc. is handled; never silently replace the draft.
    return apiError("Generation failed: the model response could not be validated. Your saved draft is unchanged. Please try again.", 502);
  }
}
