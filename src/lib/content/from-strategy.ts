import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { generateContent } from "@/lib/ai/generate";
import { routedProvider } from "@/lib/model/router";
import { CHANNEL_META } from "@/lib/formats";
import type { StrategyBody } from "@/lib/strategy/generate";
import { approvedStrategy, StrategyError } from "@/lib/strategy/service";
import { bannedTerms, checkDraft, formatDraft } from "./checks";
import { DISCARDED_STATUSES, draftKey, planDrafts } from "./plan";

/**
 * Write drafts from the approved strategy — US-044.
 *
 * Refused without an approved strategy: content is only ever written from a
 * plan the founder agreed to (US-043). Re-running is safe; a channel and
 * format that already has a live draft for this strategy is skipped.
 * Drafts land in the review queue with their angle and any flags, and only
 * a recorded human approval can move them toward publishing.
 */

type VoiceJSON = { tone?: string; language?: string; themes?: string; avoid?: string; cta?: string };

export async function writeDraftsFromStrategy(workspaceId: string, opts: { strategyId?: string } = {}) {
  const strategy = opts.strategyId
    ? await prisma.strategy.findFirst({ where: { id: opts.strategyId, workspaceId } })
    : await approvedStrategy(workspaceId);
  if (!strategy) throw new StrategyError("not_found", "Approve a distribution strategy first. Drafts are written from it.", 409);
  if (strategy.status !== "approved") {
    throw new StrategyError("invalid_state", `Strategy v${strategy.version} is ${strategy.status}. Drafts are written only from an approved strategy.`, 409);
  }

  const profile = await prisma.productProfile.findUnique({ where: { workspaceId } });
  if (!profile) throw new StrategyError("no_profile", "Add your product profile first.", 422);
  let voice: VoiceJSON = {};
  try {
    voice = JSON.parse(profile.brandVoice || "{}") as VoiceJSON;
  } catch {
    voice = {};
  }
  const banned = bannedTerms(voice.avoid);
  const body = JSON.parse(strategy.body) as StrategyBody;

  const existing = await prisma.contentItem.findMany({
    where: { workspaceId, strategyId: strategy.id, status: { notIn: DISCARDED_STATUSES } },
    select: { id: true, channel: true, format: true },
  });
  const done = new Set(existing.map(draftKey));
  const plan = planDrafts(body).filter((d) => !done.has(draftKey(d)));

  const created: { id: string; channel: string; format: string; flagged: boolean; isFallback: boolean }[] = [];
  for (const d of plan) {
    const result = await generateContent({
      channel: d.channel,
      format: d.format,
      angle: d.angle || undefined,
      provider: routedProvider({ workspaceId, purpose: "content_draft" }),
      campaign: null,
      profile: {
        name: profile.name,
        description: profile.description,
        valueProp: profile.valueProp,
        audience: profile.audience || "the target audience",
        positioning: profile.positioning ?? undefined,
      },
      brandVoice: voice,
    });
    const text = formatDraft(d.channel, d.format, result.body);
    const flags = checkDraft({ channel: d.channel, format: d.format, body: text, banned });
    const item = await prisma.contentItem.create({
      data: {
        workspaceId,
        channel: d.channel,
        format: d.format,
        title: `Strategy v${strategy.version} — ${CHANNEL_META[d.channel].label} ${d.format.replace(/_/g, " ")}`.slice(0, 160),
        body: text,
        status: "ready_for_review",
        strategyId: strategy.id,
        angle: d.angle || null,
        checks: JSON.stringify(flags),
        generationMeta: JSON.stringify({ provider: result.provider, isFallback: result.isFallback, note: result.label, strategyId: strategy.id }),
        videoExtras: result.videoExtras ? JSON.stringify(result.videoExtras) : "{}",
        sourceRef: `strategy:${strategy.id}`,
      },
    });
    await prisma.contentRevision.create({
      data: { contentItemId: item.id, title: item.title, body: text, note: `Draft from strategy v${strategy.version}: ${result.label}`, authorType: "ai", meta: JSON.stringify({ strategyId: strategy.id, angle: d.angle }) },
    });
    created.push({ id: item.id, channel: d.channel, format: d.format, flagged: flags.length > 0, isFallback: result.isFallback });
  }

  if (created.length) {
    await recordActivity({
      workspaceId,
      type: "content_created",
      actorType: "ai",
      summary: `${created.length} draft${created.length === 1 ? "" : "s"} written from strategy v${strategy.version}${created.some((c) => c.flagged) ? `, ${created.filter((c) => c.flagged).length} flagged for review` : ""}.`,
      meta: { strategyId: strategy.id },
    });
  }
  return { strategyId: strategy.id, version: strategy.version, created, skipped: existing.length };
}
