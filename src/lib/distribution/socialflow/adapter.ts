import { call, type Transport } from "@/lib/distribution/socialflow/client";
import { operatorFetch, safeFetch } from "@/lib/net/safe-fetch";
import { mcpTransport } from "@/lib/distribution/socialflow/mcp-transport";
import {
  ROUTES,
  IDEMPOTENCY_HEADER,
  accountsResponse,
  analyticsResponse,
  capabilitiesSchema,
  connectResponse,
  postResponse,
  revokeResponse,
  verifyResponse,
  type SFPost,
} from "@/lib/distribution/socialflow/contract";
import {
  failureOutcome,
  unsupported,
  type AccountCapabilities,
  type DistributionErrorCode,
  type DistributionProvider,
  type PostAnalytics,
  type ProviderContext,
  type PublishOutcome,
  type PublishRequest,
  type Result,
} from "@/lib/distribution/types";

/**
 * SocialFlow.ai distribution provider — US-031.
 *
 * Implements DistributionProvider against the UNVERIFIED contract
 * (contract.ts). Disabled unless BOTH are true:
 *   - SOCIALFLOW_API_URL is configured, and
 *   - SOCIALFLOW_VERIFIED=true, set only after `npm run smoke:socialflow`
 *     (US-037) published and read back a real post.
 * While disabled the registry never returns it, so it is never called.
 *
 * Credentials (the workspace's SocialFlow.ai API key) live encrypted in the
 * ChannelConnection and arrive here decrypted as ctx.credentials.apiKey.
 *
 * Honesty rule: a post counts as published only when SocialFlow.ai reports
 * status "published". "queued" is accepted-but-unconfirmed and is retried with
 * the same idempotency key, which returns the same post rather than a new one.
 */

const PROVIDER_ID = "socialflow";

/**
 * SOCIALFLOW_API_URL is operator configuration, so it may point at a private
 * address (SocialFlow Lite on the same Docker network) — but only when the
 * operator says so explicitly. By default every call keeps the SSRF guard.
 */
export function defaultTransport(): Transport | undefined {
  const bytes = process.env.SOCIALFLOW_ALLOW_PRIVATE_NETWORK === "true" ? operatorFetch : undefined;
  // SOCIALFLOW_TRANSPORT=mcp: the same contract carried as MCP tool calls to <SOCIALFLOW_API_URL>/mcp.
  if (process.env.SOCIALFLOW_TRANSPORT === "mcp") return mcpTransport(bytes ?? safeFetch);
  return bytes;
}

export type SocialFlowOptions = {
  baseUrl?: string;
  transport?: Transport;
  /** Tests only: bypass the env-based enablement. */
  enabledOverride?: boolean;
  timeoutMs?: number;
};

function codeFrom(post: SFPost): DistributionErrorCode {
  const c = post.error?.code;
  return c === "auth_failed" || c === "revoked" || c === "rate_limited" || c === "unsupported_format" || c === "validation"
    ? c
    : "unknown";
}

export class SocialFlowProvider implements DistributionProvider {
  readonly id = PROVIDER_ID;
  readonly label = "SocialFlow.ai";

  constructor(private readonly opts: SocialFlowOptions = {}) {}

  private baseUrl(): string {
    return this.opts.baseUrl ?? process.env.SOCIALFLOW_API_URL ?? "";
  }

  enabled(): boolean {
    if (this.opts.enabledOverride !== undefined) return this.opts.enabledOverride;
    return Boolean(this.baseUrl()) && process.env.SOCIALFLOW_VERIFIED === "true";
  }

  private cfg(ctx: ProviderContext) {
    const apiKey = typeof ctx.credentials.apiKey === "string" ? ctx.credentials.apiKey : "";
    return { baseUrl: this.baseUrl(), apiKey, transport: this.opts.transport ?? defaultTransport(), timeoutMs: this.opts.timeoutMs };
  }

  private missingConfig(ctx: ProviderContext): string | null {
    if (!this.baseUrl()) return "SOCIALFLOW_API_URL is not configured.";
    if (!this.cfg(ctx).apiKey) return "No SocialFlow.ai API key is stored for this connection.";
    return null;
  }

  async validateCredentials(ctx: ProviderContext) {
    const missing = this.missingConfig(ctx);
    if (missing) return { ok: false, detail: missing, channels: [] };
    const me = await call(this.cfg(ctx), ROUTES.verify, verifyResponse);
    if (!me.ok) return { ok: false, detail: me.error.message, channels: [] };
    const accounts = await this.listAccounts(ctx);
    const channels = accounts.ok ? [...new Set(accounts.value.filter((a) => a.status === "active").map((a) => a.platform))] : [];
    return { ok: true, detail: `Verified SocialFlow.ai organisation ${me.value.organization_id}.`, channels };
  }

  async connectAccount(ctx: ProviderContext, platform: string): Promise<Result<{ connectUrl: string }>> {
    const res = await call(this.cfg(ctx), ROUTES.connect, connectResponse, { body: { platform } });
    return res.ok ? { ok: true, value: { connectUrl: res.value.connect_url } } : res;
  }

  async listAccounts(ctx: ProviderContext) {
    const res = await call(this.cfg(ctx), ROUTES.accounts, accountsResponse);
    if (!res.ok) return res;
    return {
      ok: true as const,
      value: res.value.accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        handle: a.handle,
        status: a.status,
        tokenExpiresAt: a.token_expires_at ? new Date(a.token_expires_at) : null,
        capabilities: { publish: a.capabilities.publish, schedule: a.capabilities.schedule, analytics: a.capabilities.analytics, formats: a.capabilities.formats, maxLength: a.capabilities.max_length },
      })),
    };
  }

  async getCapabilities(ctx: ProviderContext, accountId: string): Promise<Result<AccountCapabilities>> {
    const res = await call(this.cfg(ctx), ROUTES.capabilities, capabilitiesSchema, { params: { accountId } });
    if (!res.ok) return res;
    const c = res.value;
    return { ok: true, value: { publish: c.publish, schedule: c.schedule, analytics: c.analytics, formats: c.formats, maxLength: c.max_length } };
  }

  async revokeAccount(ctx: ProviderContext, accountId: string): Promise<Result<{ platformConfirmed: boolean }>> {
    const res = await call(this.cfg(ctx), ROUTES.revoke, revokeResponse, { params: { accountId } });
    return res.ok ? { ok: true, value: { platformConfirmed: res.value.provider_revoked ?? false } } : res;
  }

  private async submit(req: PublishRequest, scheduledAt?: Date): Promise<PublishOutcome> {
    const missing = this.missingConfig(req.ctx);
    if (missing) return failureOutcome({ code: "auth_failed", message: missing, retryable: false });
    const res = await call(this.cfg(req.ctx), ROUTES.publish, postResponse, {
      headers: { [IDEMPOTENCY_HEADER]: req.idempotencyKey },
      body: {
        ...(req.accountId ? { account_id: req.accountId } : {}),
        channel: req.channel,
        text: req.text,
        ...(req.title ? { title: req.title } : {}),
        ...(scheduledAt ? { scheduled_at: scheduledAt.toISOString() } : {}),
      },
    });
    if (!res.ok) return failureOutcome(res.error, res.raw);

    const post = res.value;
    if (post.status === "failed") {
      const code = codeFrom(post);
      return failureOutcome(
        { code, message: `SocialFlow.ai could not publish: ${post.error?.message ?? "no reason given"}`, retryable: code === "rate_limited" },
        res.raw,
      );
    }
    if (post.status === "cancelled") {
      return failureOutcome({ code: "unknown", message: "SocialFlow.ai answered with a cancelled post; nothing was published.", retryable: false }, res.raw);
    }
    if (scheduledAt ? post.status === "scheduled" || post.status === "published" : post.status === "published") {
      return { ok: true, externalId: post.id, externalUrl: post.url ?? undefined, raw: res.raw };
    }
    // Accepted but not confirmed: retry later with the same idempotency key.
    return {
      ...failureOutcome(
        { code: "provider_unavailable", message: `SocialFlow.ai accepted the post (${post.status}) but has not confirmed publication yet.`, retryable: true },
        res.raw,
      ),
      externalId: post.id,
    };
  }

  publish(req: PublishRequest): Promise<PublishOutcome> {
    return this.submit(req);
  }

  schedule(req: PublishRequest & { scheduledFor: Date }): Promise<PublishOutcome> {
    return this.submit(req, req.scheduledFor);
  }

  async getStatus(ctx: ProviderContext, externalId: string) {
    const res = await call(this.cfg(ctx), ROUTES.status, postResponse, { params: { postId: externalId } });
    if (!res.ok) return res;
    return { ok: true as const, value: { state: res.value.status, url: res.value.url ?? undefined } };
  }

  async cancelScheduled(ctx: ProviderContext, externalId: string): Promise<Result<{ state: "cancelled" }>> {
    const res = await call(this.cfg(ctx), ROUTES.cancel, postResponse, { params: { postId: externalId } });
    if (!res.ok) return res;
    return res.value.status === "cancelled"
      ? { ok: true, value: { state: "cancelled" } }
      : { ok: false, error: { code: "unknown", message: `SocialFlow.ai answered ${res.value.status} instead of cancelled.`, retryable: false } };
  }

  async getAnalytics(ctx: ProviderContext, externalId: string): Promise<Result<PostAnalytics>> {
    const res = await call(this.cfg(ctx), ROUTES.analytics, analyticsResponse, { params: { postId: externalId } });
    if (!res.ok) {
      return res.error.code === "not_found" ? unsupported("Analytics for this post", this.label) : res;
    }
    const a = res.value;
    return { ok: true, value: { collectedAt: new Date(a.collected_at), impressions: a.impressions, clicks: a.clicks, engagements: a.engagements } };
  }
}

export const socialflowProvider = new SocialFlowProvider();
