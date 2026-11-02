import { type ZodSchema } from "zod";
import { env } from "@/lib/env";

/**
 * Typed AI provider boundary. The application depends on this interface, never
 * on a specific model vendor. Supports: OpenAI-compatible endpoints, safe
 * retries, timeouts, usage metadata, structured-output validation, and a
 * clearly labeled local template fallback when no credentials are configured.
 */

export type UsageMeta = {
  provider: string;
  model: string;
  isFallback: boolean;
  label: string;
  promptTokens?: number;
  completionTokens?: number;
  /** List cost in USD when the gateway reports it (e.g. OpenCode's usage.opencode.list_cost). */
  reportedCostUsd?: number;
};

export type GenResult = { text: string; usage: UsageMeta };

export interface AIProvider {
  readonly name: string;
  complete(req: { system: string; user: string; maxTokens: number; temperature?: number }): Promise<GenResult>;
}

export class AIError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
    this.name = "AIError";
  }
}

// --- OpenAI-compatible provider ---

export class OpenAICompatProvider implements AIProvider {
  readonly name = "openai-compat";

  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string
  ) {}

  async complete(req: { system: string; user: string; maxTokens: number; temperature?: number }): Promise<GenResult> {
    const { apiKey, baseUrl, model } = this;
    const res = await fetchJSONWithTimeout(
      `${baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          ...gatewayHeaders(baseUrl),
          ...parseExtraHeaders(env.OPENAI_EXTRA_HEADERS),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          max_tokens: req.maxTokens,
          temperature: req.temperature ?? 0.7,
        }),
      },
      60_000
    );
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      const body = res.bodyText.slice(0, 500);
      throw new AIError(`Model provider returned ${res.status}: ${body}`, retryable);
    }
    const data = res.json as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; opencode?: { list_cost?: number } };
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new AIError("Model provider returned an empty completion.");
    return {
      text,
      usage: {
        provider: "openai-compat",
        model,
        isFallback: false,
        label: `Live model: ${model}`,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        reportedCostUsd: reportedCost(data.usage),
      },
    };
  }
}

/**
 * Headers a known gateway asks for. OpenCode's inference API (Go plans in
 * particular) rejects requests without a per-conversation `x-opencode-session`
 * and asks clients to name themselves in the user agent. Every Banyan
 * completion is a single-turn conversation, so each call gets a fresh id.
 */
export function gatewayHeaders(baseUrl: string): Record<string, string> {
  let host = "";
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return {};
  }
  if (host !== "opencode.ai" && !host.endsWith(".opencode.ai")) return {};
  return { "user-agent": "banyan/0.1", "x-opencode-session": `banyan-${crypto.randomUUID()}` };
}

/** A positive, finite cost the gateway put in the usage block, preferring the list price over a subscription's zero. */
export function reportedCost(usage: { cost?: number; opencode?: { list_cost?: number } } | undefined): number | undefined {
  for (const v of [usage?.opencode?.list_cost, usage?.cost]) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return undefined;
}

async function fetchJSONWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; json: unknown; bodyText: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const bodyText = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(bodyText);
    } catch {
      /* non-JSON body */
    }
    return { ok: res.ok, status: res.status, json, bodyText };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AIError("Model provider timed out.", true);
    }
    throw new AIError(`Model provider request failed: ${(err as Error).message}`, true);
  }
}

// --- Experimental local brain: a running OpenCode server (dev only) ---

/**
 * Uses a local `opencode serve` instance as a temporary brain while no API key
 * is configured. Each completion opens a throwaway OpenCode session with every
 * tool disabled (text in, text out), then deletes it. OpenCode retries failed
 * upstream calls indefinitely, so a hard timeout aborts the session and the
 * router degrades to the labeled template fallback instead of hanging.
 */
const OPENCODE_DISABLED_TOOLS = Object.fromEntries(
  [
    "bash", "edit", "write", "read", "glob", "grep", "list", "patch", "multiedit", "webfetch",
    "websearch", "codesearch", "task", "todowrite", "todoread", "skill", "lsp", "question",
  ].map((t) => [t, false])
);

export class OpenCodeSessionProvider implements AIProvider {
  readonly name = "opencode-session";

  constructor(
    private baseUrl: string,
    private password: string,
    private model: string,
    private timeoutMs: number,
    private fetchImpl: typeof fetch = fetch,
    private statusPollMs = 1_500
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.password) h.authorization = `Basic ${Buffer.from(`opencode:${this.password}`).toString("base64")}`;
    return h;
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }

  async complete(req: { system: string; user: string; maxTokens: number; temperature?: number }): Promise<GenResult> {
    const [providerID, ...rest] = this.model.split("/");
    const modelID = rest.join("/");
    if (!providerID || !modelID) throw new AIError(`OPENCODE_MODEL must look like "provider/model", got "${this.model}".`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let sessionId: string | null = null;
    try {
      const created = await this.fetchImpl(this.url("/session"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ title: "banyan-brain" }),
        signal: controller.signal,
      });
      if (!created.ok) {
        throw new AIError(`OpenCode refused to open a session (${created.status}).`, created.status >= 500);
      }
      sessionId = ((await created.json()) as { id?: string }).id ?? null;
      if (!sessionId) throw new AIError("OpenCode returned no session id.");

      const sid = sessionId;
      const send = this.fetchImpl(this.url(`/session/${sid}/message`), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: { providerID, modelID },
          system: req.system,
          tools: OPENCODE_DISABLED_TOOLS,
          parts: [{ type: "text", text: req.user }],
        }),
        signal: controller.signal,
      });
      send.catch(() => null); // may lose the race below and reject after abort
      // OpenCode keeps retrying upstream failures and holds the request open;
      // its session status says why. Fail fast on a non-transient reason.
      let watching = true;
      const stuck = (async (): Promise<never> => {
        while (watching) {
          await new Promise((r) => setTimeout(r, this.statusPollMs));
          if (!watching) break;
          const status = await this.fetchImpl(this.url("/session/status"), { headers: this.headers(), signal: controller.signal })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null) as Record<string, { type?: string; attempt?: number; message?: string; action?: unknown }> | null;
          const mine = status?.[sid];
          if (mine?.type === "retry" && (mine.action || (mine.attempt ?? 0) >= 3)) {
            throw new AIError(`OpenCode cannot reach the model: ${mine.message ?? "upstream keeps failing"}`.slice(0, 400));
          }
        }
        return new Promise<never>(() => {});
      })();
      const res = await Promise.race([send, stuck]).finally(() => {
        watching = false;
      });
      const bodyText = await res.text();
      if (!res.ok) throw new AIError(`OpenCode returned ${res.status}: ${bodyText.slice(0, 300)}`, res.status >= 500);

      const data = JSON.parse(bodyText) as {
        info?: { error?: { name?: string; data?: { message?: string } }; tokens?: { input?: number; output?: number } };
        parts?: { type?: string; text?: string }[];
      };
      if (data.info?.error) {
        const e = data.info.error;
        throw new AIError(`OpenCode model error: ${e.data?.message ?? e.name ?? "unknown"}`.slice(0, 400));
      }
      const text = (data.parts ?? [])
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("")
        .trim();
      if (!text) throw new AIError("OpenCode returned an empty completion.");
      return {
        text,
        usage: {
          provider: this.name,
          model: this.model,
          isFallback: false,
          label: `Experimental brain (OpenCode): ${this.model}`,
          promptTokens: data.info?.tokens?.input,
          completionTokens: data.info?.tokens?.output,
        },
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new AIError(`OpenCode did not answer within ${Math.round(this.timeoutMs / 1000)}s (check its key or free quota).`);
      }
      throw new AIError(`OpenCode request failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (sessionId) {
        // Stop any upstream retry loop and drop the throwaway session.
        const sid = sessionId;
        void this.fetchImpl(this.url(`/session/${sid}/abort`), { method: "POST", headers: this.headers() })
          .catch(() => null)
          .then(() => this.fetchImpl(this.url(`/session/${sid}`), { method: "DELETE", headers: this.headers() }))
          .catch(() => null);
      }
    }
  }
}

/** True when the OpenCode brain may serve calls: configured, no API key, never in production. */
export function openCodeBrainEnabled(): boolean {
  return (
    !env.OPENAI_API_KEY &&
    (env.AI_PROVIDER === "opencode" || env.AI_PROVIDER === "") &&
    !!env.OPENCODE_URL &&
    env.NODE_ENV !== "production"
  );
}

/** What serves live generation right now, for capability/status surfaces. */
export function describeLiveModel(): { live: boolean; model: string; via: "managed" | "opencode" | "none" } {
  if (env.OPENAI_API_KEY && env.AI_PROVIDER !== "none") return { live: true, model: env.OPENAI_MODEL, via: "managed" };
  if (openCodeBrainEnabled()) return { live: true, model: env.OPENCODE_MODEL, via: "opencode" };
  return { live: false, model: "banyan-template-1", via: "none" };
}

// --- Local development fallback (clearly labeled, never passed off as live) ---

export class TemplateFallbackProvider implements AIProvider {
  readonly name = "template-fallback";

  async complete(req: { system: string; user: string; maxTokens: number }): Promise<GenResult> {
    // Deterministic, honest, template-based drafting. Output is always labeled
    // so it can never be mistaken for a live model response.
    const { text } = buildTemplateDraft(req.user);
    return {
      text,
      usage: {
        provider: "template-fallback",
        model: "banyan-template-1",
        isFallback: true,
        label:
          "Development fallback: template-based draft (no model credentials configured). Edit heavily before use.",
      },
    };
  }
}

function buildTemplateDraft(userPrompt: string): { text: string } {
  const lines: string[] = [
    "TEMPLATE DRAFT — generated locally without a live model. Treat as a starting skeleton, not finished copy.",
    "",
    `Request summary: ${userPrompt.replace(/\s+/g, " ").slice(0, 200)}`,
    "",
    "1. State the problem your audience already feels, in their words.",
    "2. Show the smallest concrete demonstration of the solution.",
    "3. Name the specific outcome and close with your call to action.",
  ];
  return { text: lines.join("\n") };
}

// --- Selection ---

/**
 * Parse the optional OPENAI_EXTRA_HEADERS env value (a JSON object of header
 * name → value). Forgiving by design: invalid JSON or non-object shapes yield
 * no extra headers rather than throwing — a misconfigured gateway header must
 * degrade to the labeled fallback path, never crash the workspace.
 */
export function parseExtraHeaders(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number") out[key] = String(value);
    }
    return out;
  } catch {
    return {};
  }
}

export function getAIProvider(): { provider: AIProvider; usage: UsageMeta } {
  const wantsOpenai = (env.AI_PROVIDER === "openai" || env.AI_PROVIDER === "") && env.OPENAI_API_KEY;
  if (wantsOpenai) {
    const provider = new OpenAICompatProvider(env.OPENAI_API_KEY, env.OPENAI_BASE_URL, env.OPENAI_MODEL);
    return {
      provider,
      usage: { provider: provider.name, model: env.OPENAI_MODEL, isFallback: false, label: `Live model: ${env.OPENAI_MODEL}` },
    };
  }
  if (openCodeBrainEnabled()) {
    const provider = new OpenCodeSessionProvider(
      env.OPENCODE_URL,
      env.OPENCODE_PASSWORD,
      env.OPENCODE_MODEL,
      env.OPENCODE_TIMEOUT_MS
    );
    return {
      provider,
      usage: {
        provider: provider.name,
        model: env.OPENCODE_MODEL,
        isFallback: false,
        label: `Experimental brain (OpenCode): ${env.OPENCODE_MODEL}`,
      },
    };
  }
  const provider = new TemplateFallbackProvider();
  return {
    provider,
    usage: {
      provider: provider.name,
      model: "banyan-template-1",
      isFallback: true,
      label: "Development fallback (no model credentials configured)",
    },
  };
}

// --- Completion wrapper with safe retries and validation ---

export async function completeValidated<T>(args: {
  provider?: AIProvider;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  schema: ZodSchema<T>;
  onRetryable?: () => void;
}): Promise<{ data: T; usage: UsageMeta }> {
  const selected = args.provider ?? getAIProvider().provider;
  let usage: UsageMeta;
  try {
    const res = await selected.complete({
      system: args.system,
      user: args.user,
      maxTokens: args.maxTokens,
      temperature: args.temperature,
    });
    usage = res.usage;
    args.onRetryable?.();
    const data = args.schema.parse(res.text);
    return { data, usage };
  } catch (err) {
    if (err instanceof AIError) {
      if (err.retryable) {
        const res = await selected.complete({
          system: args.system,
          user: args.user,
          maxTokens: args.maxTokens,
        });
        usage = res.usage;
        const data = args.schema.parse(res.text); // throws ZodError on invalid output
        return { data, usage };
      }
      throw err;
    }
    throw err;
  }
}

/** JSON-mode helpers for structured generation. */
export function extractJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Recover JSON from fenced or surrounding prose.
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[1] ?? match[0]);
    throw new AIError("Model output did not contain valid JSON.");
  }
}
