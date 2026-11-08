import { estimateDraftRun, type Estimate } from "@/lib/credits/ledger";
import { planDrafts } from "@/lib/content/plan";
import { Prisma, type Strategy } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { CHANNELS } from "@/lib/formats";
import { enabledProviderIds } from "@/lib/distribution/providers";
import { approvalState } from "@/lib/product/profile-review";
import { recordSchemaResult, routeComplete } from "@/lib/model/router";
import { generateStrategy, type ChannelCapability, type ProfileFact, type StrategyBody, type StrategyCompleter } from "./generate";
import { objectiveFromProfile, preferredChannels, profileFacts } from "./facts";
import { reviewDecision, validateEditedBody } from "./review";

/**
 * Strategy persistence and gating — US-042. The generation rules live in
 * generate.ts (pure, unit-tested); this module loads context, enforces the
 * approved-profile gate and stores each version.
 */

export class StrategyError extends Error {
  constructor(public code: "no_profile" | "profile_not_approved" | "not_found" | "invalid_state" | "no_facts", message: string, public status: number) {
    super(message);
  }
}

/**
 * What each channel can do right now. SocialFlow.ai publishing is used only
 * when its adapter is enabled (verified); scheduling through it is not
 * verified anywhere yet, so it is always false. Short-form video is produced
 * and published by hand.
 */
export function channelCapabilities(): ChannelCapability[] {
  const socialflow = enabledProviderIds().includes("socialflow");
  return CHANNELS.map((channel) =>
    channel === "shortvideo"
      ? { channel, publishing: "manual" as const, scheduling: false }
      : { channel, publishing: socialflow ? ("socialflow" as const) : ("export" as const), scheduling: false },
  );
}

function toneOf(brandVoice: string | null | undefined): string | undefined {
  try {
    const v = JSON.parse(brandVoice || "{}") as { tone?: unknown };
    return typeof v.tone === "string" && v.tone.trim() ? v.tone.trim() : undefined;
  } catch {
    return undefined;
  }
}

export async function createStrategy(opts: { workspaceId: string; userId: string | null; goalId?: string | null }): Promise<Strategy> {
  const profile = await prisma.productProfile.findUnique({ where: { workspaceId: opts.workspaceId } });
  if (!profile) throw new StrategyError("no_profile", "Add your product profile first. The strategy is built from it.", 422);
  const approval = approvalState(profile);
  if (approval.needsApproval) throw new StrategyError("profile_not_approved", approval.reason, 409);

  const goal = opts.goalId ? await prisma.goal.findFirst({ where: { id: opts.goalId, workspaceId: opts.workspaceId } }) : null;
  if (opts.goalId && !goal) throw new StrategyError("not_found", "Goal not found.", 404);

  const facts = profileFacts(profile);
  if (facts.length === 0) throw new StrategyError("no_facts", "The product profile is empty. Describe the product before generating a strategy.", 422);
  // A next cycle carries exactly one change from the last cycle's report (src/lib/next-cycle.ts); the strategist must apply it.
  const change = goal?.constraints.split(";").map((c) => c.trim()).find((c) => /^change from last cycle:/i.test(c));
  const objective = goal
    ? `${goal.objective}${goal.successMetric ? ` (success metric: ${goal.successMetric.replace(/_/g, " ")})` : ""}${change ? `. Apply one ${change.replace(/^change from last cycle:/i, "change from the last cycle:")}; keep everything else as before.` : ""}`
    : objectiveFromProfile(profile);

  let lastCallId: string | null = null;
  const complete: StrategyCompleter = async ({ system, user, maxTokens, temperature, prompt, attempt }) => {
    const res = await routeComplete({ workspaceId: opts.workspaceId, purpose: "strategy", system, user, maxTokens, temperature, prompt, attempt });
    lastCallId = res.modelCallId;
    return {
      text: res.text,
      live: res.usage.provider !== "template-fallback" && !res.quotaDeferred,
      report: (valid) => recordSchemaResult(res.modelCallId, valid),
    };
  };

  const outcome = await generateStrategy(
    { facts, objective, preferredChannels: preferredChannels(profile.channels), capabilities: channelCapabilities(), tone: toneOf(profile.brandVoice) },
    complete,
  );

  // Versions are per workspace; a concurrent generation loses the unique
  // race and retries once with the next number.
  for (let tries = 0; ; tries++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const last = await tx.strategy.findFirst({ where: { workspaceId: opts.workspaceId }, orderBy: { version: "desc" }, select: { version: true } });
        await tx.strategy.updateMany({ where: { workspaceId: opts.workspaceId, status: "proposed" }, data: { status: "superseded" } });
        return tx.strategy.create({
          data: {
            workspaceId: opts.workspaceId,
            goalId: goal?.id ?? null,
            version: (last?.version ?? 0) + 1,
            body: JSON.stringify(outcome.body),
            method: outcome.method,
            fallbackReason: outcome.fallbackReason,
            facts: JSON.stringify(facts),
            objective,
            profileVersion: profile.version,
            promptName: outcome.prompt?.name ?? null,
            promptVersion: outcome.prompt?.version ?? null,
            modelCallId: outcome.method === "model" ? lastCallId : null,
            createdById: opts.userId,
          },
        });
      });
      await recordActivity({
        workspaceId: opts.workspaceId,
        type: "strategy",
        actorType: outcome.method === "model" ? "ai" : "system",
        summary: `Strategy v${created.version} proposed (${outcome.method === "model" ? "model" : "template"}): ${outcome.body.channels.map((c) => c.channel).join(", ")}.`,
        meta: { strategyId: created.id },
      });
      return created;
    } catch (err) {
      if (tries === 0 && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
}

export type StrategyView = {
  id: string;
  version: number;
  status: string;
  method: string;
  fallbackReason: string | null;
  objective: string;
  body: StrategyBody;
  facts: ProfileFact[];
  profileVersion: number;
  /** True when the profile has changed (or lost its approval) since generation. */
  stale: boolean;
  prompt: string | null;
  model: { provider: string; model: string; isFallback: boolean } | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  /** What writing this strategy's drafts costs (US-056), shown before approval. */
  draftEstimate: Estimate & { drafts: number };
};

export async function strategyView(s: Strategy): Promise<StrategyView> {
  const [profile, call] = await Promise.all([
    prisma.productProfile.findUnique({ where: { workspaceId: s.workspaceId }, select: { version: true, approvedAt: true, fieldSources: true } }),
    s.modelCallId ? prisma.modelCall.findUnique({ where: { id: s.modelCallId }, select: { provider: true, model: true, isFallback: true } }) : null,
  ]);
  const stale = !profile || profile.version !== s.profileVersion || approvalState(profile).needsApproval;
  return {
    id: s.id,
    version: s.version,
    status: s.status,
    method: s.method,
    fallbackReason: s.fallbackReason,
    objective: s.objective,
    body: JSON.parse(s.body) as StrategyBody,
    facts: JSON.parse(s.facts || "[]") as ProfileFact[],
    profileVersion: s.profileVersion,
    stale,
    prompt: s.promptName ? `${s.promptName}.v${s.promptVersion}` : null,
    model: call,
    approvedAt: s.approvedAt?.toISOString() ?? null,
    rejectedReason: s.rejectedReason,
    createdAt: s.createdAt.toISOString(),
    draftEstimate: (() => {
      const plan = planDrafts(JSON.parse(s.body) as StrategyBody);
      return { ...estimateDraftRun({ drafts: plan.length, channels: new Set(plan.map((d) => d.channel)).size }), drafts: plan.length };
    })(),
  };
}

// ————— Review (US-043) —————

async function loadOwned(workspaceId: string, id: string): Promise<Strategy> {
  const s = await prisma.strategy.findFirst({ where: { id, workspaceId } });
  if (!s) throw new StrategyError("not_found", "Strategy not found.", 404);
  return s;
}

/** The approved strategy content generation works from, or null. */
export async function approvedStrategy(workspaceId: string): Promise<Strategy | null> {
  return prisma.strategy.findFirst({ where: { workspaceId, status: "approved" }, orderBy: { version: "desc" } });
}

export async function approveStrategy(workspaceId: string, id: string, userId: string): Promise<Strategy> {
  const s = await loadOwned(workspaceId, id);
  const view = await strategyView(s);
  const decision = reviewDecision(s.status, "approve", { stale: view.stale });
  if (!decision.ok) throw new StrategyError("invalid_state", decision.reason, 409);
  if (decision.idempotent) return s;
  // Conditional update: two approvals racing cannot both win.
  const approved = await prisma.$transaction(async (tx) => {
    const res = await tx.strategy.updateMany({ where: { id, workspaceId, status: "proposed" }, data: { status: "approved", approvedAt: new Date(), approvedById: userId } });
    if (res.count === 0) throw new StrategyError("invalid_state", "This strategy changed while you were approving it. Reload and try again.", 409);
    await tx.strategy.updateMany({ where: { workspaceId, status: "approved", id: { not: id } }, data: { status: "superseded" } });
    return tx.strategy.findUniqueOrThrow({ where: { id } });
  });
  await recordActivity({ workspaceId, type: "strategy", actorType: "user", summary: `Strategy v${approved.version} approved.`, meta: { strategyId: id } });
  return approved;
}

export async function rejectStrategy(workspaceId: string, id: string, reason: string): Promise<Strategy> {
  const s = await loadOwned(workspaceId, id);
  const decision = reviewDecision(s.status, "reject");
  if (!decision.ok) throw new StrategyError("invalid_state", decision.reason, 409);
  if (decision.idempotent) return s;
  const res = await prisma.strategy.updateMany({ where: { id, workspaceId, status: "proposed" }, data: { status: "rejected", rejectedReason: reason } });
  if (res.count === 0) throw new StrategyError("invalid_state", "This strategy changed while you were rejecting it. Reload and try again.", 409);
  await recordActivity({ workspaceId, type: "strategy", actorType: "user", summary: `Strategy v${s.version} rejected: ${reason.slice(0, 140)}`, meta: { strategyId: id } });
  return prisma.strategy.findUniqueOrThrow({ where: { id } });
}

/**
 * Save edits from the founder as the next version. The source version is
 * left exactly as it was; the edit must pass the same rules as model output
 * and cite the same fact snapshot.
 */
export async function editStrategy(workspaceId: string, id: string, userId: string, rawBody: unknown): Promise<Strategy> {
  const source = await loadOwned(workspaceId, id);
  const profile = await prisma.productProfile.findUnique({ where: { workspaceId } });
  const facts = JSON.parse(source.facts || "[]") as ProfileFact[];
  const checked = validateEditedBody(rawBody, {
    facts,
    objective: source.objective,
    preferredChannels: preferredChannels(profile?.channels),
    capabilities: channelCapabilities(),
  });
  if (!checked.ok) throw new StrategyError("invalid_state", `The edit breaks a strategy rule: ${checked.problems.join("; ")}`, 422);

  const created = await prisma.$transaction(async (tx) => {
    const last = await tx.strategy.findFirst({ where: { workspaceId }, orderBy: { version: "desc" }, select: { version: true } });
    await tx.strategy.updateMany({ where: { workspaceId, status: "proposed" }, data: { status: "superseded" } });
    return tx.strategy.create({
      data: {
        workspaceId,
        goalId: source.goalId,
        version: (last?.version ?? 0) + 1,
        body: JSON.stringify(checked.body),
        method: "edited",
        fallbackReason: null,
        facts: source.facts,
        objective: source.objective,
        profileVersion: source.profileVersion,
        promptName: source.promptName,
        promptVersion: source.promptVersion,
        modelCallId: source.modelCallId,
        createdById: userId,
      },
    });
  });
  await recordActivity({ workspaceId, type: "strategy", actorType: "user", summary: `Strategy v${created.version} saved from edits to v${source.version}.`, meta: { strategyId: created.id, from: id } });
  return created;
}
