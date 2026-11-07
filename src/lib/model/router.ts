import { AIError, TemplateFallbackProvider, type AIProvider, type GenResult, type UsageMeta, getAIProvider } from "@/lib/ai/provider";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { evaluateRunQuota, priceRunUsage, type AgentRunRecord } from "@/lib/model/agent-run";
import { estimateCostMicros, evaluateQuota, startOfUtcDay, type QuotaDecision } from "@/lib/model/quota";
import { hasPrompt, promptKey, type PromptRef } from "@/lib/ai/prompts/registry";

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
  /** The registered prompt that produced system/user (US-045). */
  prompt?: PromptRef;
  /** 1 for the first try; the workflow passes 2+ on its retries. */
  attempt?: number;
};

export type ModelRouteResult = {
  /** The ledger row for the call that served this result, when it was recorded. */
  modelCallId: string | null;
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

/**
 * Live model actions used against the daily quota: single-shot calls recorded
 * here plus completed agentic runs (ADR-007 — one run = one unit, same
 * ledger, same counter).
 */
export async function countLiveModelActionsToday(workspaceId: string): Promise<number> {
  return prisma.modelCall.count({
    where: {
      workspaceId,
      isFallback: false,
      ok: true,
      createdAt: { gte: startOfUtcDay() },
    },
  });
}

const countLiveCallsToday = countLiveModelActionsToday;

/** A failed call does not use the allowance: an outage should not eat a founder's daily quota. */
export const ROUTER_RETRY = { attempts: 2, delayMs: 800, withinMs: 30_000 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function routeComplete(req: ModelRouteRequest): Promise<ModelRouteResult> {
  const started = Date.now();
  // A versioned prompt must exist: an unregistered version would make the
  // ledger point at instructions nobody can find.
  if (req.prompt && !hasPrompt(req.prompt)) throw new Error(`Unknown prompt ${promptKey(req.prompt)}`);

  // 1. Quota gate on live usage for this workspace.
  const liveToday = await countLiveCallsToday(req.workspaceId);
  const decision = evaluateQuota({ liveCallsToday: liveToday, limitPerDay: env.MODEL_MAX_CALLS_PER_DAY });
  if (!decision.allowed) {
    const res = await serveFallback(req, started, decision.reason ?? undefined);
    return { ...res, quotaDeferred: true };
  }

  // 2. Resolve the provider chain in order; first available live provider wins.
  // A blip (429, 5xx, a dropped connection) gets one more try on the spot: without it,
  // a single 429 hands the founder a template draft. Slow failures don't retry, so a
  // request is never held for two full timeouts.
  const chain = resolveProviderChain(req.workspaceId);
  let lastError: string | undefined;
  for (const link of chain) {
    if (!link.provider || !link.usage) continue;
    for (let attempt = 1; attempt <= ROUTER_RETRY.attempts; attempt++) {
      const ledgerReq = { ...req, attempt: (req.attempt ?? 1) + attempt - 1 };
      try {
        const result: GenResult = await link.provider.complete({
          system: req.system,
          user: req.user,
          maxTokens: req.maxTokens,
          temperature: req.temperature,
        });
        const latencyMs = Date.now() - started;
        const modelCallId = await recordCall(ledgerReq, result.usage, latencyMs, true);
        return {
          modelCallId,
          text: result.text,
          usage: result.usage,
          latencyMs,
          quotaDeferred: false,
        };
      } catch (err) {
        const message = err instanceof AIError || err instanceof Error ? err.message : String(err);
        lastError = message.slice(0, 500);
        // Record the failure, then retry a blip or try the next link (eventually the fallback).
        await recordCall(ledgerReq, link.usage, Date.now() - started, false, lastError);
        const retryable = err instanceof AIError && err.retryable;
        if (!retryable || attempt >= ROUTER_RETRY.attempts || Date.now() - started >= ROUTER_RETRY.withinMs) break;
        await sleep(ROUTER_RETRY.delayMs);
      }
    }
  }

  // 3. No live provider served this. Say which it was: nothing configured is a setup
  // question, a failing provider is an incident. The provider's own words stay in the
  // ledger and in providerError, out of the label a founder reads.
  if (lastError !== undefined) {
    const res = await serveFallback(req, started, "The live model failed, so this draft is a template.");
    return { ...res, quotaDeferred: false, providerError: lastError };
  }
  const res = await serveFallback(req, started, "No live model provider available.");
  return { ...res, quotaDeferred: false };
}

async function serveFallback(req: ModelRouteRequest, started: number, note?: string): Promise<ModelRouteResult> {
  const fallback = new TemplateFallbackProvider();
  const result = await fallback.complete({ system: req.system, user: req.user, maxTokens: req.maxTokens });
  const usage: UsageMeta = note
    ? { ...result.usage, label: `${result.usage.label}${note ? ` — ${note}` : ""}` }
    : result.usage;
  const latencyMs = Date.now() - started;
  const modelCallId = await recordCall(req, usage, latencyMs, true);
  return { modelCallId, text: result.text, usage, latencyMs, quotaDeferred: false };
}

async function recordCall(
  req: ModelRouteRequest,
  usage: UsageMeta,
  latencyMs: number,
  ok: boolean,
  error?: string
): Promise<string | null> {
  try {
    const row = await prisma.modelCall.create({
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
          : usage.reportedCostUsd !== undefined
            ? Math.round(usage.reportedCostUsd * 1_000_000)
            : estimateCostMicros(usage.model, usage.promptTokens ?? 0, usage.completionTokens ?? 0),
        latencyMs,
        ok,
        error: error ?? null,
        promptName: req.prompt?.name ?? null,
        promptVersion: req.prompt?.version ?? null,
        attempt: req.attempt ?? 1,
      },
      select: { id: true },
    });
    return row.id;
  } catch {
    // The ledger must never break the workflow it observes.
    return null;
  }
}

/**
 * Record whether the output of a call passed the workflow schema (US-045).
 * Calls nobody validates (chat) keep schemaValid null.
 */
export async function recordSchemaResult(modelCallId: string | null, schemaValid: boolean): Promise<void> {
  if (!modelCallId) return;
  try {
    await prisma.modelCall.update({ where: { id: modelCallId }, data: { schemaValid } });
  } catch {
    /* never break the workflow */
  }
}

// --- Agentic runs (ADR-007): one run = one quota unit = one ledger row ---

/**
 * Pre-session gate for the agent runtime: may this workspace start one more
 * agentic run today? Counts the same ledger rows as the single-shot quota —
 * completed runs are recorded as live calls by `recordAgentRun`, so no second
 * counter exists. When refused, the handler degrades to the labeled template
 * path exactly as an over-quota single-shot call does.
 */
export async function checkRunQuota(workspaceId: string): Promise<QuotaDecision> {
  return evaluateRunQuota({
    liveModelActionsToday: await countLiveModelActionsToday(workspaceId),
    limitPerDay: env.MODEL_MAX_CALLS_PER_DAY,
  });
}

/**
 * Write one agentic run's aggregate usage to the ledger: a single live
 * `ModelCall` row (counts as one quota unit) with the session tree's tokens
 * and an honest cost — a true total when every model is priced, otherwise 0
 * with the unpriced models named in a structured warning (prices are never
 * guessed, and a partial sum is never presented as a total). The ledger must
 * never break the runtime it observes, so failures return null.
 */
export async function recordAgentRun(run: AgentRunRecord): Promise<string | null> {
  const price = priceRunUsage(run.perModel);
  const reportedMicros = run.reportedCostUsd && run.reportedCostUsd > 0 ? Math.round(run.reportedCostUsd * 1_000_000) : null;
  if (reportedMicros === null && price.unpricedModels.length > 0) {
    log(
      "warn",
      "agent_run_cost_incomplete",
      {
        purpose: run.purpose,
        runtime: run.runtime,
        workspaceId: run.workspaceId,
        unpricedModels: price.unpricedModels,
        detail: "recording tokens with cost 0 (prices are never guessed)",
      },
      "worker"
    );
  }
  try {
    const models = [...new Set(run.perModel.map((m) => m.model))].sort();
    const row = await prisma.modelCall.create({
      data: {
        workspaceId: run.workspaceId,
        purpose: run.purpose,
        provider: run.runtime === "opencode" ? "opencode-runtime" : "direct-runtime",
        model: models.length > 0 ? models.join("+") : "none",
        isFallback: false,
        promptTokens: price.inputTokens,
        completionTokens: price.outputTokens,
        // Same rule as single-shot calls: what the provider reported beats our table.
        estCostMicros: reportedMicros ?? price.estCostMicros,
        latencyMs: run.latencyMs,
        ok: run.ok,
        error: run.ok ? null : ((run.error ?? "Agent run failed.").slice(0, 500)),
        attempt: run.attempt ?? 1,
      },
      select: { id: true },
    });
    return row.id;
  } catch {
    return null;
  }
}

/**
 * An AIProvider that goes through the router: quota, usage ledger and the
 * labelled fallback. Hand it to code written against AIProvider (the content
 * generators) so their calls are counted like every other model call.
 */
export function routedProvider(opts: { workspaceId: string; purpose: ModelPurpose; prompt?: PromptRef }): AIProvider {
  return {
    name: "routed",
    async complete(req) {
      const res = await routeComplete({ ...opts, system: req.system, user: req.user, maxTokens: req.maxTokens, temperature: req.temperature });
      return { text: res.text, usage: res.usage };
    },
  };
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
