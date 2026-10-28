/**
 * Usage quotas for the model router — pure logic, no I/O.
 *
 * The router counts live model calls per workspace per UTC day and enforces a
 * configurable cap before spending. Quotas exist to make managed model access
 * safe to expose: a runaway workflow cannot silently burn the provider budget.
 */

export type QuotaState = {
  liveCallsToday: number;
  limitPerDay: number;
};

export type QuotaDecision = {
  allowed: boolean;
  reason: string | null;
  remaining: number;
};

export function evaluateQuota(state: QuotaState): QuotaDecision {
  const limit = Math.max(0, Math.floor(state.limitPerDay));
  const used = Math.max(0, Math.floor(state.liveCallsToday));
  if (used >= limit) {
    return {
      allowed: false,
      reason: `Daily managed-model quota reached (${used}/${limit} live calls today). Workflows continue with the labeled template fallback until the quota resets at UTC midnight.`,
      remaining: 0,
    };
  }
  return { allowed: true, reason: null, remaining: limit - used };
}

export function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Conservative estimated cost in micro-USD (1e-6 USD) for a completed call.
 * Returns 0 when the model is not in the known-price table — we never guess
 * prices, so unknown models record tokens only.
 */
const MICRO_USD_PER_1K_TOKENS: { match: RegExp; input: number; output: number }[] = [
  { match: /gpt-4o-mini/i, input: 150, output: 600 }, // $0.15 / $0.60 per 1k
  { match: /gpt-4o/i, input: 2500, output: 10000 }, // $2.50 / $10 per 1k
  { match: /gpt-4-turbo/i, input: 1000, output: 3000 },
  { match: /gpt-3\.5/i, input: 50, output: 150 },
];

export function estimateCostMicros(model: string, promptTokens: number, completionTokens: number): number {
  for (const p of MICRO_USD_PER_1K_TOKENS) {
    if (p.match.test(model)) {
      return Math.round((promptTokens / 1000) * p.input + (completionTokens / 1000) * p.output);
    }
  }
  return 0;
}
