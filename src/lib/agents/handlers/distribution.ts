import { routedProvider } from "@/lib/model/router";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { attemptPublication } from "@/lib/publishing/publish";
import { generateContent } from "@/lib/ai/generate";
import { isFormatFor, isChannel, isManualChannel, type Channel } from "@/lib/formats";
import { DEFAULT_CHANNEL_FORMATS, contentSpecsForChannels } from "@/lib/agents/workflow-template";
import { createTasksFromSpecs, loadBusinessContext, makeLogger, safeJSON } from "@/lib/agents/handlers/common";
import { priorLearningLines } from "@/lib/learning-memory";
import type { HandlerContext, HandlerResult } from "@/lib/agents/types";
import type { StrategyOutput } from "@/lib/agents/handlers/planning";

/**
 * Distribution handlers: campaign creation, channel-specific drafting, the
 * human approval gate, and provider-confirmed publishing.
 */

// --- campaign_plan ---

export async function handleCampaignPlan(ctx: HandlerContext): Promise<HandlerResult> {
  const log = makeLogger(ctx);
  const goal = ctx.task.goalId ? await prisma.goal.findUnique({ where: { id: ctx.task.goalId } }) : null;
  if (!goal) return { outcome: "failed", error: "campaign_plan requires a goal.", retryable: false };

  // Idempotent adoption: a crashed previous attempt may already have created the campaign.
  const prior = ctx.task.output?.refs?.campaignId;
  if (prior) {
    const existing = await prisma.campaign.findFirst({ where: { id: prior, workspaceId: ctx.workspaceId } });
    if (existing) {
      log.push("adopt", `Adopting existing campaign ${existing.id} from a previous attempt.`);
      return {
        outcome: "completed",
        output: {
          summary: `Campaign "${existing.name}" already exists (adopted from a previous attempt — no duplicate created).`,
          refs: { campaignId: existing.id },
          data: { campaignName: existing.name, channels: safeJSON<string[]>(existing.channels, []), formats: safeJSON<string[]>(existing.formats, []), keyMessage: existing.keyMessage, cta: existing.cta, successMetric: existing.successMetric },
        },
      };
    }
  }

  const biz = await loadBusinessContext(ctx.workspaceId);
  // The injected dep is a TaskOutput envelope; the strategy payload is under .data.
  const strategy =
    (ctx.task.inputs.deps as { strategy?: { data?: StrategyOutput } } | undefined)?.strategy?.data ?? null;
  const channels = (strategy?.channelFocus ?? []).filter(isChannel);
  const useChannels = channels.length ? channels : (["x", "linkedin"] as Channel[]);
  const formats = DEFAULT_CHANNEL_FORMATS.filter((f) => useChannels.includes(f.channel as Channel)).map((f) => f.format);
  const voice = safeJSON<{ cta?: string }>(biz.profile?.brandVoice ?? "{}", {});
  const audience = biz.profile?.audience || strategy?.positioning?.slice(0, 120) || "the target audience";
  const themes = strategy?.contentThemes ?? [];

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: ctx.workspaceId,
      goalId: goal.id,
      name: `${goal.objective.slice(0, 60)} — wave 1`,
      objective: goal.objective,
      targetAudience: audience,
      keyMessage: strategy?.positioning || themes[0] || goal.objective,
      // Evidence is only ever the labelled hypotheses recorded so far — never invented results.
      evidence: themes.length ? `Hypotheses under test (labelled, unvalidated): ${themes.join(" | ")}` : "",
      cta: voice.cta || strategy?.rationale?.slice(0, 100) || "Try the product and tell us what's missing",
      channels: JSON.stringify(useChannels),
      formats: JSON.stringify(formats),
      schedule: JSON.stringify({ notes: "Created by the agent workflow from the approved plan." }),
      successMetric: goal.successMetric,
      status: "planned",
    },
  });
  log.push("campaign_created", `Campaign ${campaign.id} created in planned state.`);

  // Queue the channel-specific content drafts + the approval gate + downstream stages.
  const specs = contentSpecsForChannels(
    goal.id,
    campaign.id,
    useChannels.map((c) => ({ channel: c, format: DEFAULT_CHANNEL_FORMATS.find((f) => f.channel === c)?.format ?? "single" }))
  );
  await createTasksFromSpecs(specs, { workspaceId: ctx.workspaceId, goalId: goal.id, campaignId: campaign.id });
  log.push("downstream_created", `${specs.length} downstream task(s) queued (content drafts, approval gate, publish, measure, evaluate, recommend).`);

  await recordActivity({
    workspaceId: ctx.workspaceId,
    type: "campaign",
    actorType: "ai",
    summary: `Campaign "${campaign.name}" created from the approved plan (channels: ${useChannels.join(", ")}).`,
    meta: { campaignId: campaign.id, goalId: goal.id },
  });

  return {
    outcome: "completed",
    output: {
      summary: `Campaign "${campaign.name}" created (status planned) with ${useChannels.length} channel(s).`,
      refs: { campaignId: campaign.id },
      data: { campaignName: campaign.name, channels: useChannels, formats, keyMessage: campaign.keyMessage, cta: campaign.cta, successMetric: campaign.successMetric },
    },
  };
}

// --- content_draft ---

export async function handleContentDraft(ctx: HandlerContext): Promise<HandlerResult> {
  const log = makeLogger(ctx);
  const channel = String(ctx.task.inputs.channel ?? "");
  const format = String(ctx.task.inputs.format ?? "");
  const campaignId = typeof ctx.task.inputs.campaignId === "string" ? ctx.task.inputs.campaignId : null;
  if (!isChannel(channel) || !isFormatFor(channel, format)) {
    return { outcome: "failed", error: `Invalid channel/format "${channel}/${format}".`, retryable: false };
  }

  // Idempotent adoption.
  const prior = ctx.task.output?.refs?.contentItemId;
  if (prior) {
    const existing = await prisma.contentItem.findFirst({ where: { id: prior, workspaceId: ctx.workspaceId } });
    if (existing) {
      log.push("adopt", `Adopting existing content item ${existing.id}.`);
      return {
        outcome: "completed",
        output: {
          summary: `Draft already exists for ${channel} (adopted — no duplicate created).`,
          refs: { contentItemId: existing.id },
          data: { contentItemId: existing.id, channel, format },
        },
      };
    }
  }

  const campaign = campaignId
    ? await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId: ctx.workspaceId } })
    : null;
  const biz = await loadBusinessContext(ctx.workspaceId);
  if (!biz.profile) {
    return { outcome: "blocked", reason: "No business profile configured.", actionable: "Complete your workspace profile so drafts are grounded in real context, then retry this task." };
  }

  const voice = safeJSON<{ tone?: string; language?: string; themes?: string; avoid?: string; cta?: string }>(biz.profile.brandVoice ?? "{}", {});
  const result = await generateContent({
    channel,
    format,
    provider: routedProvider({ workspaceId: ctx.workspaceId, purpose: "content_draft" }),
    // The loop compounds: drafts are written with the workspace's concluded
    // experiments in view, not as if every campaign were the first.
    learning: priorLearningLines(biz.experiments, 4),
    campaign: campaign
      ? {
          name: campaign.name,
          objective: campaign.objective,
          targetAudience: campaign.targetAudience,
          keyMessage: campaign.keyMessage,
          evidence: campaign.evidence,
          cta: campaign.cta,
        }
      : null,
    profile: {
      name: biz.profile.name,
      description: biz.profile.description,
      valueProp: biz.profile.valueProp,
      audience: biz.profile.audience || campaign?.targetAudience || "the target audience",
      positioning: biz.profile.positioning ?? undefined,
    },
    brandVoice: voice,
  });
  log.push("generated", result.label);

  const item = await prisma.contentItem.create({
    data: {
      workspaceId: ctx.workspaceId,
      campaignId: campaign?.id ?? null,
      channel,
      format,
      title: `${campaign?.name ?? "Standalone"} — ${channel} ${format}`.slice(0, 160),
      body: result.body,
      // Agent drafts go straight to the review queue: they are complete, and
      // only a recorded human approval can ever move them toward publishing.
      status: "ready_for_review",
      generationMeta: JSON.stringify({ provider: result.provider, isFallback: result.isFallback, note: result.label, taskId: ctx.task.id }),
      videoExtras: result.videoExtras ? JSON.stringify(result.videoExtras) : "{}",
      sourceRef: `task:${ctx.task.id}`,
    },
  });
  await prisma.contentRevision.create({
    data: { contentItemId: item.id, title: item.title, body: result.body, note: `Agent draft — ${result.label}`, authorType: "ai", meta: JSON.stringify({ taskId: ctx.task.id }) },
  });
  await recordActivity({
    workspaceId: ctx.workspaceId,
    type: "content_created",
    actorType: "ai",
    summary: `Draft created for ${channel} (${format}) — ${result.label}.`,
    meta: { contentItemId: item.id, taskId: ctx.task.id },
  });

  return {
    outcome: "completed",
    output: {
      summary: `Draft created for ${channel}/${format}. Awaiting human approval before anything publishes.`,
      refs: { contentItemId: item.id },
      data: { contentItemId: item.id, channel, format },
      generatedLabel: result.label,
      isFallback: result.isFallback,
    },
  };
}

// --- approval_gate ---

export async function handleApprovalGate(ctx: HandlerContext): Promise<HandlerResult> {
  const campaignId = typeof ctx.task.inputs.campaignId === "string" ? ctx.task.inputs.campaignId : null;
  const items = await prisma.contentItem.findMany({
    where: { workspaceId: ctx.workspaceId, ...(campaignId ? { campaignId } : {}), status: { not: "archived" } },
    select: { id: true, title: true, status: true, channel: true, rejectionReason: true },
  });
  if (items.length === 0) {
    return { outcome: "blocked", reason: "No content items found for this campaign.", actionable: "Check the content drafts; if they were deleted, retry the content tasks." };
  }
  const rejected = items.filter((i) => i.status === "rejected");
  if (rejected.length > 0) {
    return {
      outcome: "blocked",
      reason: `${rejected.length} draft(s) were rejected (${rejected.map((r) => r.channel).join(", ")}).`,
      actionable: "Revise or replace the rejected drafts in Content, then retry this approval task.",
    };
  }
  const pending = items.filter((i) => ["draft", "ready_for_review"].includes(i.status));
  if (pending.length > 0) {
    return {
      outcome: "waiting_approval",
      note: `${pending.length} draft(s) awaiting human review in Approvals. Publishing is refused without recorded approval.`,
    };
  }
  const approved = items.filter((i) => ["approved", "scheduled", "published"].includes(i.status));
  return {
    outcome: "completed",
    output: {
      summary: `${approved.length} content item(s) carry recorded human approval (${approved.map((a) => a.channel).join(", ")}).`,
      data: { approvedIds: approved.map((a) => a.id) },
    },
  };
}

// --- publish ---

type PublishAttempt = { contentItemId: string; channel: string; status: string; publicationId?: string; externalUrl?: string; detail: string };

export async function handlePublish(ctx: HandlerContext): Promise<HandlerResult> {
  const log = makeLogger(ctx);
  const campaignId = typeof ctx.task.inputs.campaignId === "string" ? ctx.task.inputs.campaignId : null;

  // Reconciliation: a previous attempt may have scheduled a provider retry; the
  // publication may have completed since. Adopt reality instead of re-publishing.
  const priorOutput = ctx.task.output ?? null;
  if (priorOutput?.refs?.publicationId) {
    const pub = await prisma.publication.findUnique({ where: { id: priorOutput.refs.publicationId }, include: { contentItem: true } });
    if (pub && pub.contentItem.workspaceId === ctx.workspaceId) {
      if (pub.status === "published") {
        log.push("reconcile", "Provider retry completed since the last attempt; adopting the published state.");
        return {
          outcome: "completed",
          output: {
            summary: `Publication confirmed by the provider after a retry (${pub.contentItem.title}).`,
            refs: { publicationId: pub.id, publicationStatus: "published" },
            data: { publicationStatus: "published", externalUrl: pub.externalUrl ?? undefined, publicationId: pub.id },
          },
        };
      }
      if (pub.status === "failed") {
        return { outcome: "failed", error: `Publication failed after retries: ${pub.lastError ?? "provider error"}.`, retryable: true };
      }
      if (pub.status === "scheduled" || pub.status === "attempting") {
        return { outcome: "blocked", reason: "A publication attempt is still in flight (provider retry scheduled).", actionable: "The publishing worker will complete it; retry this task afterwards if it does not." };
      }
    }
  }

  const items = await prisma.contentItem.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(campaignId ? { campaignId } : {}),
      status: { in: ["approved", "scheduled"] },
      approvedById: { not: null },
    },
    orderBy: { createdAt: "asc" },
  });
  if (items.length === 0) {
    return {
      outcome: "blocked",
      reason: "No approved content available to publish.",
      actionable: "Approve the drafts in Approvals first — publishing without recorded human approval is refused by design.",
      output: { summary: "Nothing to publish: no approved content.", refs: {}, data: { publicationStatus: "blocked" } },
    };
  }

  // Short-form video has no provider integration: it is scripted and prepared,
  // then recorded/published by hand. Never count it as a live publish attempt.
  const liveItems = items.filter((item) => !isManualChannel(item.channel));
  const manualItems = items.filter((item) => isManualChannel(item.channel));
  const manualHandoff = manualItems.map((item) => ({
    contentItemId: item.id,
    channel: item.channel,
    title: item.title,
  }));
  if (liveItems.length === 0) {
    return {
      outcome: "blocked",
      reason: "Only short-form video is approved; that channel is a manual handoff, not a live publish.",
      actionable:
        "Approve at least one X or LinkedIn asset so this cycle can publish something measurable, or record the video manually in Publishing.",
      output: {
        summary: "Publishing blocked: no live-channel content approved.",
        refs: {},
        data: { publicationStatus: "blocked", manualHandoff },
      },
    };
  }

  log.push("publishing", `${liveItems.length} live item(s); ${manualItems.length} manual handoff(s).`);
  const attempts: PublishAttempt[] = [];
  for (const item of liveItems) {
    const res = await attemptPublication({
      contentItemId: item.id,
      workspaceId: ctx.workspaceId,
      connectionId: null,
      mode: "now",
    });
    attempts.push({
      contentItemId: item.id,
      channel: item.channel,
      status: res.status,
      publicationId: res.publicationId,
      detail: res.message,
    });
    log.push("attempt", `${item.channel}: ${res.status} — ${res.message}`);
  }

  const published = attempts.filter((a) => a.status === "published");
  const blocked = attempts.filter((a) => a.status === "blocked");
  const failed = attempts.filter((a) => a.status === "failed");
  const retryScheduled = attempts.filter((a) => a.status === "retry_scheduled");

  if (published.length === attempts.length) {
    // Provider confirmed everything. Attach a tracked link when the profile has a website.
    const biz = await loadBusinessContext(ctx.workspaceId);
    const website = biz.profile?.website?.trim();
    const links: string[] = [];
    if (website && /^https?:\/\//.test(website)) {
      for (const p of published) {
        try {
          const { createTrackedLink } = await import("@/lib/analytics/links");
          const { link } = await createTrackedLink({
            workspaceId: ctx.workspaceId,
            targetUrl: website,
            channel: p.channel,
            campaignId,
            contentItemId: p.contentItemId,
          });
          links.push(link.slug);
        } catch {
          log.push("link", "Tracked-link creation failed; measurement falls back to honest zero for clicks.");
        }
      }
    }
    return {
      outcome: "completed",
      output: {
        summary: `${published.length} publication(s) confirmed by the provider.${links.length ? ` ${links.length} tracked link(s) attached for measurement.` : ""}${manualItems.length ? ` ${manualItems.length} manual handoff(s) prepared.` : ""}`,
        refs: { publicationId: published[0].publicationId ?? "", publicationStatus: "published" },
        data: {
          publicationStatus: "published",
          externalUrl: published[0].externalUrl,
          publications: attempts,
          trackedLinks: links,
          manualHandoff,
        },
      },
    };
  }

  if (blocked.length > 0) {
    const first = blocked[0];
    // Persist progress so a retry reconciles instead of re-publishing confirmed items.
    return {
      outcome: "blocked",
      reason: `${blocked.length}/${attempts.length} publication(s) blocked: ${first.detail}`,
      actionable:
        "Automated publishing is not available yet (SocialFlow.ai has no verifiable API). Export the approved post, publish it yourself, and record the live URL as a manual publication. The workflow state is preserved.",
      output: {
        summary: `Publishing blocked: ${published.length}/${attempts.length} confirmed, ${blocked.length} blocked.`,
        refs: { publicationId: (published[0]?.publicationId ?? first.publicationId) ?? "" },
        data: { publicationStatus: "blocked", publications: attempts, manualHandoff },
      },
    };
  }

  if (retryScheduled.length > 0 && failed.length === 0) {
    return {
      outcome: "blocked",
      reason: `Transient provider failure; retry scheduled by the publishing worker (${retryScheduled[0].detail}).`,
      actionable: "No action needed — the worker retries automatically. This task reconciles on the next run.",
      output: {
        summary: `Provider retry scheduled (${retryScheduled.length} publication(s) in flight).`,
        refs: { publicationId: retryScheduled[0].publicationId ?? "" },
        data: { publicationStatus: "retry_scheduled", publications: attempts, manualHandoff },
      },
    };
  }

  return {
    outcome: "failed",
    error: failed[0]?.detail ?? "Publishing failed.",
    retryable: true,
    output: {
      summary: `Publishing failed for ${failed.length}/${attempts.length} item(s).`,
      refs: { publicationId: (published[0]?.publicationId ?? failed[0]?.publicationId) ?? "" },
      data: { publicationStatus: "failed", publications: attempts, manualHandoff },
    },
  };
}
