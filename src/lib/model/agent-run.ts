import type { QuotaDecision } from "./quota";
import { estimateCostMicros, modelPriceKnown } from "./quota";

/**
 * Metering governance for agentic runs (ADR-007, ADR-006 §5) — pure logic.
 * The database side (counting today's actions, writing the ledger row) lives
 * in the model router, which owns the ledger.
 *
 * One run = one quota unit = one ledger row:
 *  - the run is gated by the same per-workspace daily quota as single-shot
 *    calls, checked *before* the session starts (`checkRunQuota` in the
 *    router);
 *  - on completion the runtime records a single `ModelCall` row with the
 *    session tree's aggregate usage (`recordAgentRun` in the router), so the
 *    existing live-call count covers runs and no second counter exists;
 *  - spend *inside* a run is bounded by the roster's `steps` caps and (from
 *    R4) the per-run token budget — not by the daily quota.
 *
 * A non-zero `estCostMicros` is always a true total: when any model in the
 * run has no known price, the row records tokens with cost 0 and the unpriced
 * models are named in a warning. A partial sum is never presented as a total.
 */

/** Quota units one agentic run consumes from the workspace's daily allowance. */
export const RUN_QUOTA_UNITS = 1;

export type RunModelUsage = { model: string; inputTokens: number; outputTokens: number };

export type RunPrice = {
  inputTokens: number;
  outputTokens: number;
  /** micro-USD total; 0 unless every model in the run is priced (never guessed, never partial). */
  estCostMicros: number;
  /** Models without a price-table entry; empty exactly when the total is complete. */
  unpricedModels: string[];
};

/** Price a run's per-model usage (e.g. OpenCode `sessions.stats` broken down by model). */
export function priceRunUsage(perModel: RunModelUsage[]): RunPrice {
  const inputTokens = perModel.reduce((s, m) => s + Math.max(0, m.inputTokens), 0);
  const outputTokens = perModel.reduce((s, m) => s + Math.max(0, m.outputTokens), 0);
  const unpricedModels = [...new Set(perModel.map((m) => m.model).filter((m) => !modelPriceKnown(m)))];
  const estCostMicros =
    unpricedModels.length === 0
      ? perModel.reduce((s, m) => s + estimateCostMicros(m.model, m.inputTokens, m.outputTokens), 0)
      : 0;
  return { inputTokens, outputTokens, estCostMicros, unpricedModels };
}

/**
 * May a run start? A run needs RUN_QUOTA_UNITS free slots in today's
 * live-model allowance. Same counter as single-shot calls, because completed
 * runs are recorded as live `ModelCall` rows.
 */
export function evaluateRunQuota(state: { liveModelActionsToday: number; limitPerDay: number }): QuotaDecision {
  const limit = Math.max(0, Math.floor(state.limitPerDay));
  const used = Math.max(0, Math.floor(state.liveModelActionsToday));
  if (used + RUN_QUOTA_UNITS > limit) {
    return {
      allowed: false,
      reason: `Daily managed-model quota reached (${used}/${limit} live model actions today; one agent run needs ${RUN_QUOTA_UNITS}). The task degrades to the labeled template path until the quota resets at UTC midnight.`,
      remaining: 0,
    };
  }
  return { allowed: true, reason: null, remaining: limit - used - RUN_QUOTA_UNITS };
}

export type AgentRunRecord = {
  workspaceId: string;
  /** The task type or role this run served, e.g. "research" (same vocabulary as ModelPurpose). */
  purpose: string;
  runtime: "opencode" | "direct";
  /** Per-model usage across the whole session tree. */
  perModel: RunModelUsage[];
  /** The session tree's total when the provider reports one; preferred over the price table. */
  reportedCostUsd?: number;
  steps: number;
  toolCalls: number;
  latencyMs: number;
  ok: boolean;
  error?: string | null;
  attempt?: number;
};
