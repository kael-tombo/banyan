/**
 * Shared publishing result types. The provider interface itself is
 * DistributionProvider (src/lib/distribution/types.ts).
 */

export type PublishingCapabilities = {
  provider: string;
  channels: string[];
  immediatePublish: boolean;
  schedule: boolean;
  metrics: boolean;
  externalUrl: boolean;
};

export type PublishResult = {
  ok: boolean;
  externalId?: string;
  externalUrl?: string;
  raw: unknown; // always stored for the audit trail
  error?: string;
  // Transient-failure classification (worker retry policy). Adapters set it
  // for timeouts, rate limits and provider outages; absent means permanent.
  retryable?: boolean;
  // Provider-declared cool-down (e.g. HTTP Retry-After), in milliseconds.
  retryAfterMs?: number;
};
