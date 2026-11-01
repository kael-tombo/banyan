import { z } from "zod";

/**
 * The SocialFlow.ai integration contract — US-030.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ UNVERIFIED. This is the API Banyan NEEDS from SocialFlow.ai, written  │
 * │ as a proposal for the SocialFlow.ai team to implement. It is NOT a    │
 * │ description of an existing SocialFlow.ai API: none exists today       │
 * │ (docs/SOCIALFLOW_INTEGRATION_AUDIT.md). Paths, fields and codes may   │
 * │ change when SocialFlow.ai ships; only then are they verified.          │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Operations C1–C10 match the audit's contract table. The adapter
 * (adapter.ts) is tested against a mock server built from these schemas, so
 * when SocialFlow.ai ships, the work is: adjust this file to the real API,
 * re-run the contract tests, run the live smoke test (US-037), enable.
 */

export const CONTRACT_STATUS = "UNVERIFIED_PROPOSAL" as const;
export const CONTRACT_VERSION = "banyan-socialflow-contract/0.1";

/** Proposed HTTP mapping. Base URL comes from SOCIALFLOW_API_URL. */
export const ROUTES = {
  verify: { method: "GET", path: "/v1/me" }, // C1: authenticate Banyan's credentials
  connect: { method: "POST", path: "/v1/accounts/connect" }, // C2
  accounts: { method: "GET", path: "/v1/accounts" }, // C3
  capabilities: { method: "GET", path: "/v1/accounts/:accountId/capabilities" }, // C4
  publish: { method: "POST", path: "/v1/posts" }, // C5 (publish now) and C6 (schedule, with scheduled_at)
  status: { method: "GET", path: "/v1/posts/:postId" }, // C7
  analytics: { method: "GET", path: "/v1/posts/:postId/analytics" }, // C9
  revoke: { method: "DELETE", path: "/v1/accounts/:accountId" }, // C10
} as const;

/** Header carrying Banyan's Publication.idempotencyKey (C5, C6). */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

// ───────────── Schemas ─────────────

export const platformSchema = z.enum(["x", "linkedin", "instagram", "facebook", "tiktok", "youtube", "threads"]);

export const capabilitiesSchema = z.object({
  publish: z.boolean(),
  schedule: z.boolean(),
  analytics: z.boolean(),
  formats: z.array(z.string()),
  max_length: z.number().int().positive().optional(),
});

export const accountSchema = z.object({
  id: z.string().min(1),
  platform: platformSchema,
  handle: z.string(),
  status: z.enum(["active", "revoked", "error"]),
  capabilities: capabilitiesSchema,
});

export const verifyResponse = z.object({ organization_id: z.string().min(1), name: z.string().optional() });
export const connectResponse = z.object({ connect_url: z.string().url() });
export const accountsResponse = z.object({ accounts: z.array(accountSchema) });

export const publishRequest = z.object({
  account_id: z.string().min(1).optional(),
  channel: z.string().min(1),
  text: z.string().min(1),
  title: z.string().optional(),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
});

export const postStatus = z.enum(["queued", "scheduled", "published", "failed"]);

export const postResponse = z.object({
  id: z.string().min(1),
  status: postStatus,
  url: z.string().url().nullable().optional(),
  error: z.object({ code: z.string(), message: z.string() }).nullable().optional(),
});

export const analyticsResponse = z.object({
  collected_at: z.string().datetime({ offset: true }),
  impressions: z.number().int().nonnegative().optional(),
  clicks: z.number().int().nonnegative().optional(),
  engagements: z.number().int().nonnegative().optional(),
});

/** C10: the account is revoked on SocialFlow's side; provider_revoked says whether the platform confirmed it too. */
export const revokeResponse = z.object({
  id: z.string().min(1),
  status: z.literal("revoked"),
  provider_revoked: z.boolean().optional(),
});

/** Error body for every non-2xx response. */
export const errorResponse = z.object({
  error: z.object({
    code: z.enum(["auth_failed", "revoked", "rate_limited", "unsupported_format", "validation", "not_found", "provider_unavailable"]),
    message: z.string(),
  }),
});

export type SFAccount = z.infer<typeof accountSchema>;
export type SFPost = z.infer<typeof postResponse>;
export type SFPublishRequest = z.infer<typeof publishRequest>;
