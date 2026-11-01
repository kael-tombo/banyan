import type { PublishResult } from "@/lib/publishing/types";

/**
 * Banyan's provider-neutral distribution interface (US-027, ADR-003).
 *
 * Every automated distribution operation goes through a DistributionProvider.
 * These are Banyan's internal operations — not assumed endpoint names of any
 * vendor. A provider implements only what it can verify; everything else
 * returns an explicit `unsupported` error, never a fake success.
 *
 * SocialFlow.ai is the only intended provider (US-031). Until it is verified,
 * the registry (providers.ts) is empty and the live path is export mode:
 * the founder publishes the approved post and records the live URL.
 */

export type DistributionErrorCode =
  | "auth_failed"
  | "revoked"
  | "rate_limited"
  | "unsupported"
  | "unsupported_format"
  | "validation"
  | "not_found"
  | "timeout"
  | "provider_unavailable"
  | "unknown";

export type DistributionError = {
  code: DistributionErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: DistributionError };

/** Decrypted, provider-specific credentials for one workspace. Never sent to the browser. */
export type Credentials = Record<string, unknown>;

export type ProviderContext = { workspaceId: string; credentials: Credentials };

export type AccountCapabilities = {
  publish: boolean;
  schedule: boolean;
  analytics: boolean;
  formats: string[];
  maxLength?: number;
};

export type DistributionAccount = {
  id: string;
  platform: string;
  handle: string;
  status: "active" | "revoked" | "error";
  capabilities: AccountCapabilities;
};

export type PublishRequest = {
  ctx: ProviderContext;
  channel: string;
  text: string;
  title?: string;
  /** Provider account to publish from; null lets the provider pick the account for the channel. */
  accountId?: string | null;
  /** Banyan's Publication.idempotencyKey — providers must deduplicate on it. */
  idempotencyKey: string;
  scheduledFor?: Date | null;
};

/** PublishResult (retry classification, raw response) plus a normalised error code. */
export type PublishOutcome = PublishResult & { errorCode?: DistributionErrorCode };

export type PostAnalytics = {
  collectedAt: Date;
  impressions?: number;
  clicks?: number;
  engagements?: number;
};

export interface DistributionProvider {
  readonly id: string;
  readonly label: string;
  /**
   * True only when this deployment has the provider configured AND verified
   * by a live smoke test. A disabled provider is never called.
   */
  enabled(): boolean;
  validateCredentials(ctx: ProviderContext): Promise<{ ok: boolean; detail: string; channels: string[] }>;
  connectAccount(ctx: ProviderContext, platform: string): Promise<Result<{ connectUrl: string }>>;
  listAccounts(ctx: ProviderContext): Promise<Result<DistributionAccount[]>>;
  getCapabilities(ctx: ProviderContext, accountId: string): Promise<Result<AccountCapabilities>>;
  /** Disconnect an account at the provider; its platform token is destroyed there (Banyan never holds it). */
  revokeAccount(ctx: ProviderContext, accountId: string): Promise<Result<{ platformConfirmed: boolean }>>;
  publish(req: PublishRequest): Promise<PublishOutcome>;
  schedule(req: PublishRequest & { scheduledFor: Date }): Promise<PublishOutcome>;
  getStatus(ctx: ProviderContext, externalId: string): Promise<Result<{ state: "queued" | "scheduled" | "published" | "failed" | "unknown"; url?: string }>>;
  getAnalytics(ctx: ProviderContext, externalId: string): Promise<Result<PostAnalytics>>;
}

/** The answer for any operation a provider does not support. */
export function unsupported(operation: string, provider: string): { ok: false; error: DistributionError } {
  return {
    ok: false,
    error: { code: "unsupported", message: `${operation} is not supported by ${provider}.`, retryable: false },
  };
}

/**
 * Normalise an HTTP or network failure. `status` is null for network errors.
 * Retry-After may be seconds or an HTTP date.
 */
export function classifyHttpFailure(
  status: number | null,
  opts: { retryAfter?: string | null; message?: string; timedOut?: boolean; now?: Date } = {},
): DistributionError {
  const msg = opts.message ?? (status ? `Provider responded ${status}.` : "Provider could not be reached.");
  if (opts.timedOut) return { code: "timeout", message: msg, retryable: true };
  if (status === null) return { code: "provider_unavailable", message: msg, retryable: true };
  if (status === 429) {
    const retryAfterMs = parseRetryAfter(opts.retryAfter, opts.now);
    return { code: "rate_limited", message: msg, retryable: true, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) };
  }
  if (status === 401 || status === 403) return { code: "auth_failed", message: msg, retryable: false };
  if (status === 410) return { code: "revoked", message: msg, retryable: false };
  if (status === 404) return { code: "not_found", message: msg, retryable: false };
  if (status === 400 || status === 422) return { code: "validation", message: msg, retryable: false };
  if (status === 415) return { code: "unsupported_format", message: msg, retryable: false };
  if (status >= 500) return { code: "provider_unavailable", message: msg, retryable: true };
  return { code: "unknown", message: msg, retryable: false };
}

export function parseRetryAfter(value: string | null | undefined, now: Date = new Date()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - now.getTime());
  return undefined;
}

/** Turn a normalised error into the publishing workflow's result shape. */
export function failureOutcome(error: DistributionError, raw: unknown = null): PublishOutcome {
  return {
    ok: false,
    raw,
    error: error.message,
    errorCode: error.code,
    retryable: error.retryable,
    ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
  };
}
