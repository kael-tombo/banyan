import { AIError, TemplateFallbackProvider, type AIProvider, type GenResult, type UsageMeta, getAIProvider } from "@/lib/ai/provider";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { estimateCostMicros, evaluateQuota, startOfUtcDay } from "@/lib/model/quota";

/**
 * Model router — the single boundary between the agent runtime / business
 * workflows and language-model providers.
 *
 * Responsibilities (deliberately separate from orchestration logic):
 *  - resolve which provider serves a call (managed credentials first);
 *  - enforce per-workspace usage quotas before spending;
 *  - record every call — including fallbacks and failures — in a usage ledger;
 *  - degrade safely to the labeled template fallback instead of failing a
 *    workflow when no live provider is usable.
 *
 * The runtime never sees provider credentials or vendor types, only
 * `routeComplete()`. Adding a future provider (hosted or local) means adding
 * one resolver entry here — no workflow code changes.
 */

export type ModelPurpose =
  | "goal_parse"
  | "plan_draft"
  | "research"
  | "strategy"
  | "campaign_plan"
  | "content_draft"
  | "evaluation"
  | "recommendation"
  | "chat"
  | "product_analysis";

export type ModelRouteRequest = {
  workspaceId: string;
  purpose: ModelPurpose;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
};

export type ModelRouteResult = {
  text: string;
  usage: UsageMeta;
  latencyMs: number;
  /** True when the quota check forced the template fallback. */
  quotaDeferred: boolean;
  /** Set when the live provider errored and the fallback served instead. */
  providerError?: string;
};

export type ProviderResolution = {
  provider: AIProvider | null;
  usage: UsageMeta | null;
  /** Why no live provider was selected (informational, safe to log). */
  detail: string;
};

/**
 * Managed access first: the deployment's own server-side credentials serve
 * every workspace. Users never need a Claude or ChatGPT subscription.
 */
function resolveManagedProvider(): ProviderResolution {
  const selected = getAIProvider();
  if (selected.usage.isFallback) {
    return { provider: null, usage: null, detail: "No managed model credentials configured on this deployment." };
  }
  return { provider: selected.provider, usage: selected.usage, detail: "Managed provider (deployment credentials)." };
}

/**
 * User-provided credentials are an explicitly enabled, optional future
 * feature — off by default. When enabled they would be resolved from the
 * workspace's AES-256-GCM encrypted connections (never from the browser),
 * and used only for that workspace. Until the feature ships, this returns
 * null and the managed provider (or fallback) serves the call.
 */
function resolveUserProvider(_workspaceId: string): ProviderResolution {
  if (!process.env.USER_MODEL_KEYS_ENABLED) {
    return { provider: null, usage: null, detail: "User-provided model keys are disabled (managed access only)." };
  }
  return { provider: null, usage: null, detail: "User-provided model keys are not implemented yet." };
}

export function resolveProviderChain(workspaceId: string): ProviderResolution[] {
  return [resolveUserProvider(workspaceId), resolveManagedProvider()];
}

async function countLiveCallsToday(workspaceId: string): Promise<number> {
  return prisma.modelCall.count({
    where: {
      workspaceId,
      isFallback: false,
      createdAt: { gte: startOfUtcDay() },
    },
  });
}

export async function routeComplete(req: ModelRouteRequest): Promise<ModelRouteResult> {
  const started = Date.now();

  // 1. Quota gate on live usage for this workspace.
  const liveToday = await countLiveCallsToday(req.workspaceId);
  const decision = evaluateQuota({ liveCallsToday: liveToday, limitPerDay: env.MODEL_MAX_CALLS_PER_DAY });
  if (!decision.allowed) {
    const res = await serveFallback(req, started, decision.reason ?? undefined);
    return { ...res, quotaDeferred: true };
  }

  // 2. Resolve the provider chain in order; first available live provider wins.
  const chain = resolveProviderChain(req.workspaceId);
  for (const link of chain) {
    if (!link.provider || !link.usage) continue;
    try {
      const result: GenResult = await link.provider.complete({
        system: req.system,
        user: req.user,
        maxTokens: req.maxTokens,
        temperature: req.temperature,
      });
      const latencyMs = Date.now() - started;
      await recordCall(req, result.usage, latencyMs, true);
      return {
        text: result.text,
        usage: result.usage,
        latencyMs,
        quotaDeferred: false,
      };
    } catch (err) {
      const message = err instanceof AIError || err instanceof Error ? err.message : String(err);
      // Record the failure, then try the next link (eventually the fallback).
      await recordCall(req, link.usage, Date.now() - started, false, message.slice(0, 500));
      continue;
    }
  }

  // 3. No live provider available — labeled fallback.
  const res = await serveFallback(req, started, "No live model provider available.");
  return { ...res, quotaDeferred: false, providerError: "No live model provider available." };
}

async function serveFallback(req: ModelRouteRequest, started: number, note?: string): Promise<ModelRouteResult> {
  const fallback = new TemplateFallbackProvider();
  const result = await fallback.complete({ system: req.system, user: req.user, maxTokens: req.maxTokens });
  const usage: UsageMeta = note
    ? { ...result.usage, label: `${result.usage.label}${note ? ` — ${note}` : ""}` }
    : result.usage;
  const latencyMs = Date.now() - started;
  await recordCall(req, usage, latencyMs, true);
  return { text: result.text, usage, latencyMs, quotaDeferred: false };
}

async function recordCall(
  req: ModelRouteRequest,
  usage: UsageMeta,
  latencyMs: number,
  ok: boolean,
  error?: string
): Promise<void> {
  try {
    await prisma.modelCall.create({
      data: {
        workspaceId: req.workspaceId,
        purpose: req.purpose,
        provider: usage.provider,
        model: usage.model,
        isFallback: usage.isFallback,
        promptTokens: usage.promptTokens ?? 0,
        completionTokens: usage.completionTokens ?? 0,
        estCostMicros: usage.isFallback
          ? 0
          : estimateCostMicros(usage.model, usage.promptTokens ?? 0, usage.completionTokens ?? 0),
        latencyMs,
        ok,
        error: error ?? null,
      },
    });
  } catch {
    // The ledger must never break the workflow it observes.
  }
}

/** Aggregate usage for a workspace (settings/usage UI). */
export async function usageSummary(workspaceId: string, since?: Date) {
  const rows = await prisma.modelCall.groupBy({
    by: ["provider", "model", "isFallback"],
    where: { workspaceId, createdAt: since ? { gte: since } : undefined },
    _count: { _all: true },
    _sum: { promptTokens: true, completionTokens: true, estCostMicros: true },
  });
  const calls = rows.map((r) => ({
    provider: r.provider,
    model: r.model,
    isFallback: r.isFallback,
    calls: r._count._all,
    promptTokens: r._sum.promptTokens ?? 0,
    completionTokens: r._sum.completionTokens ?? 0,
    estCostMicros: r._sum.estCostMicros ?? 0,
  }));
  const totals = calls.reduce(
    (acc, c) => ({
      calls: acc.calls + c.calls,
      promptTokens: acc.promptTokens + c.promptTokens,
      completionTokens: acc.completionTokens + c.completionTokens,
      estCostMicros: acc.estCostMicros + c.estCostMicros,
    }),
    { calls: 0, promptTokens: 0, completionTokens: 0, estCostMicros: 0 }
  );
  const liveToday = await countLiveCallsToday(workspaceId);
  const quota = evaluateQuota({ liveCallsToday: liveToday, limitPerDay: env.MODEL_MAX_CALLS_PER_DAY });
  return { calls, totals, quota: { limit: env.MODEL_MAX_CALLS_PER_DAY, usedToday: liveToday, remaining: quota.remaining } };
}
