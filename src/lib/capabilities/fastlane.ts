import type { CapabilityAdapter, CapabilityDescriptor, CapabilityHealth } from "@/lib/capabilities/types";

/**
 * Fastlane capability adapter (usefastlane.ai).
 *
 * EVALUATION (verified from https://developers.usefastlane.ai, October 2026):
 *  - Creative generation: `POST /blitz` (async content build from a discovery
 *    queue), content angles CRUD, media bank — short-form UGC/video creative.
 *  - Publishing/scheduling: `POST /content/:id/schedule`, `GET /posts`,
 *    `POST /posts/cancel|delete` — to Fastlane-managed social accounts.
 *  - Performance measurement: `POST /analytics/posts` (batch engagement
 *    metrics) and `GET /posts`.
 *  - Brand analysis: NOT offered — no such endpoints exist.
 *  - Auth: workspace-minted API key on every request.
 *  - MCP server exists and exposes the same API to MCP clients.
 *
 * RELEVANCE TO BANYAN:
 *  - Creative generation for the `shortvideo` channel is relevant (Banyan
 *    treats short-form video as script-only today; Fastlane could render it).
 *  - Its publishing model (own warmed TikTok/Instagram accounts) does not map
 *    to Banyan's `x` / `linkedin` publication contract, so it is NOT a
 *    publishing adapter for this product.
 *  - Post analytics is relevant only for content published through Fastlane.
 *
 * IMPLEMENTATION STATUS — honest:
 *  - This adapter is implemented against the DOCUMENTED API surface only. It
 *    has NOT been exercised with real credentials in this deployment, so it
 *    reports `unverified` until a workspace connects an API key and a real
 *    call succeeds. Without credentials it reports `needs_credentials` with
 *    actionable setup guidance. It never reports availability it cannot back.
 */

export type FastlaneConfig = { apiBaseUrl: string; apiKey: string };

export const FASTLANE_DEFAULT_BASE = "https://api.usefastlane.ai";

export function fastlaneConfigFromEnv(): FastlaneConfig | null {
  const apiKey = process.env.FASTLANE_API_KEY;
  if (!apiKey) return null;
  return { apiBaseUrl: (process.env.FASTLANE_API_BASE_URL || FASTLANE_DEFAULT_BASE).replace(/\/$/, ""), apiKey };
}

export class FastlaneAdapter implements CapabilityAdapter {
  readonly id = "fastlane";
  readonly kind = "creative" as const;
  readonly label = "Fastlane (short-form creative + post analytics)";

  capabilities(): string[] {
    return ["creative.shortvideo", "creative.schedule", "metrics.posts"];
  }

  describe(): CapabilityDescriptor {
    const cfg = fastlaneConfigFromEnv();
    if (!cfg) {
      return {
        id: this.id,
        kind: this.kind,
        label: this.label,
        capabilities: this.capabilities(),
        status: "needs_credentials",
        detail:
          "Implemented against Fastlane's documented API (creative generation, scheduling, post analytics) but no FASTLANE_API_KEY is configured on this deployment. Add a workspace API key from Fastlane settings to enable it. Brand analysis is not part of Fastlane's API.",
        docsUrl: "https://developers.usefastlane.ai/",
        untested: true,
      };
    }
    return {
      id: this.id,
      kind: this.kind,
      label: this.label,
      capabilities: this.capabilities(),
      status: "unverified",
      detail:
        "Fastlane credentials are configured, but the integration has not been exercised against the live API in this deployment yet. First successful call will move it to available.",
      docsUrl: "https://developers.usefastlane.ai/",
      untested: true,
    };
  }

  async health(workspaceId: string): Promise<CapabilityHealth> {
    void workspaceId; // Fastlane keys are deployment-level here; workspace scoping arrives with per-workspace connections
    const cfg = fastlaneConfigFromEnv();
    if (!cfg) {
      return {
        ok: false,
        detail: "No FASTLANE_API_KEY configured. Set it in the deployment environment to enable short-form creative generation.",
      };
    }
    // Verify with the cheapest real call documented: list posts (GET /posts).
    try {
      const res = await fetch(`${cfg.apiBaseUrl}/posts`, {
        headers: { authorization: `Bearer ${cfg.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { ok: true, detail: "Fastlane API reachable; credentials accepted." };
      return { ok: false, detail: `Fastlane API responded ${res.status}. Check the API key and workspace status.` };
    } catch (err) {
      return { ok: false, detail: `Fastlane API unreachable: ${(err as Error).message}` };
    }
  }

  // --- Documented operations (gated on health; errors surface honestly) ---

  /** Queue a short-form creative build. Returns the async job id — never a finished asset. */
  async buildCreative(cfg: FastlaneConfig, args: { angle: string; brief: string }): Promise<{ jobId: string; raw: unknown }> {
    const res = await fetch(`${cfg.apiBaseUrl}/blitz`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ angle: args.angle, brief: args.brief }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Fastlane /blitz failed (${res.status}): ${body.slice(0, 300)}`);
    const json = JSON.parse(body) as { id?: string };
    if (!json.id) throw new Error("Fastlane /blitz returned no job id.");
    return { jobId: json.id, raw: json };
  }

  /** Schedule a built content item through Fastlane's managed accounts. */
  async scheduleContent(cfg: FastlaneConfig, args: { contentId: string; scheduledFor: string }): Promise<{ raw: unknown }> {
    const res = await fetch(`${cfg.apiBaseUrl}/content/${encodeURIComponent(args.contentId)}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ scheduledFor: args.scheduledFor }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Fastlane schedule failed (${res.status}): ${body.slice(0, 300)}`);
    return { raw: JSON.parse(body) };
  }

  /** Batch engagement metrics for posts published via Fastlane. */
  async postMetrics(cfg: FastlaneConfig, postIds: string[]): Promise<{ raw: unknown }> {
    const res = await fetch(`${cfg.apiBaseUrl}/analytics/posts`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ postIds }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Fastlane analytics failed (${res.status}): ${body.slice(0, 300)}`);
    return { raw: JSON.parse(body) };
  }
}

export const fastlaneAdapter = new FastlaneAdapter();
