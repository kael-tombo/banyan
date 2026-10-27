import { PublishingAdapter, ConnectionConfig, PublishResult, PublishingCapabilities } from "@/lib/publishing/types";
import { AIError } from "@/lib/ai/provider";

/**
 * Postiz adapter (verified against Postiz public API docs):
 *   GET  {base}/public/v1/integrations      — list connected channels
 *   POST {base}/public/v1/posts             — create post; type: now | schedule | draft
 *   GET  {base}/public/v1/posts             — list posts (status checks)
 * Auth: API key, sent as the raw `Authorization` header value.
 * License note: Postiz is AGPL-3.0; we integrate via HTTP as a calling service
 * (no source embedding), which keeps this adapter license-neutral.
 * Postiz's public API does not expose engagement metrics, so metricsSupported=false.
 */
export class PostizAdapter implements PublishingAdapter {
  readonly provider = "postiz";

  capabilities(): PublishingCapabilities {
    return {
      provider: this.provider,
      channels: ["x", "linkedin"],
      immediatePublish: true,
      schedule: true,
      metrics: false,
      externalUrl: true,
    };
  }

  async validateConnection(cfg: ConnectionConfig): Promise<{ ok: boolean; detail: string; channels: string[] }> {
    try {
      const res = await this.request(cfg, "/public/v1/integrations", "GET");
      if (res.status < 200 || res.status >= 300) {
        return { ok: false, detail: `Postiz responded ${res.status}: ${res.body.slice(0, 200)}`, channels: [] };
      }
      const integrations = res.json as { id?: string; name?: string; identifier?: string; disabled?: boolean }[] | null;
      const list = Array.isArray(integrations) ? integrations : [];
      const channels = list.filter((i) => !i.disabled).map((i) => String(i.identifier ?? i.name ?? i.id ?? "unknown"));
      if (list.length === 0) {
        return { ok: false, detail: "Connected to Postiz, but no social accounts are connected inside it. Connect accounts in your Postiz dashboard first.", channels: [] };
      }
      return { ok: true, detail: `Verified. ${list.length} connected account(s) in Postiz.`, channels };
    } catch (err) {
      return { ok: false, detail: `Could not reach Postiz: ${(err as Error).message}`, channels: [] };
    }
  }

  async publish(args: { cfg: ConnectionConfig; channel: string; text: string; title?: string; scheduledFor?: Date | null }): Promise<PublishResult> {
    const { cfg, channel, text, scheduledFor } = args;
    const integrationIds = cfg.integrationIds[channel] ?? [];
    if (integrationIds.length === 0) {
      const raw = { error: `No ${channel} integration id configured for this Postiz connection.` };
      return { ok: false, raw, error: String(raw.error) };
    }
    if (channel !== "x" && channel !== "linkedin") {
      // Short-form video publication is not supported via Postiz public API today.
      return { ok: false, raw: { error: "Short-form video publishing is manual." }, error: "Short-form video publishing is manual (no supported integration)." };
    }
    const payload = {
      type: scheduledFor ? "schedule" : "now",
      date: (scheduledFor ?? new Date()).toISOString(),
      shortLink: false,
      tags: [] as { color: string; tag_name: string; order: number }[],
      posts: integrationIds.map((id) => ({
        integration: { id },
        value: [{ content: text }],
        group: `banyan-${channel}-${integrationIds.indexOf(id)}`,
      })),
    };
    try {
      const res = await this.request(cfg, "/public/v1/posts", "POST", payload);
      const raw = res.json ?? res.body;
      if (res.status < 200 || res.status >= 300) {
        return { ok: false, raw, error: `Postiz responded ${res.status}: ${res.body.slice(0, 300)}` };
      }
      // Response shape: nested map of ids from the Postiz API; parse best-effort,
      // always storing the raw response for audit.
      const parsed = res.json as unknown;
      const externalId = findFirstId(parsed);
      return { ok: true, externalId, raw: parsed };
    } catch (err) {
      return { ok: false, raw: { error: (err as Error).message }, error: (err as Error).message };
    }
  }

  async checkStatus(args: { cfg: ConnectionConfig; externalId: string }) {
    const res = await this.request(args.cfg, "/public/v1/posts", "GET");
    const raw = res.json ?? res.body;
    let state = "unknown";
    if (Array.isArray(raw)) {
      const found = (raw as { id?: string; state?: string }[]).find((p) => String(p.id) === args.externalId);
      state = found?.state ?? "unknown";
    }
    return { state, raw };
  }

  metricsSupported(): boolean {
    return false;
  }

  private async request(
    cfg: ConnectionConfig,
    path: string,
    method: "GET" | "POST",
    body?: unknown
  ): Promise<{ status: number; json: unknown; body: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}${path}`, {
        method,
        headers: {
          // Postiz public API takes the bare API key as the Authorization value.
          Authorization: cfg.apiKey,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* keep text */
      }
      return { status: res.status, json, body: text };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new AIError("Postiz request timed out.");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

function findFirstId(parsed: unknown): string | undefined {
  let id: string | undefined;
  const walk = (node: unknown, depth = 0) => {
    if (depth > 4 || id !== undefined) return;
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.id === "string") {
        id = obj.id;
        return;
      }
      for (const v of Object.values(obj)) walk(v, depth + 1);
    }
  };
  walk(parsed);
  return id;
}

export const postizAdapter = new PostizAdapter();
