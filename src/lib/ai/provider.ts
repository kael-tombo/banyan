import { z } from "zod";
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
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
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
      usage?: { prompt_tokens?: number; completion_tokens?: number };
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
      },
    };
  }
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

export function getAIProvider(): { provider: AIProvider; usage: UsageMeta } {
  const wantsOpenai = (env.AI_PROVIDER === "openai" || env.AI_PROVIDER === "") && env.OPENAI_API_KEY;
  if (wantsOpenai) {
    const provider = new OpenAICompatProvider(env.OPENAI_API_KEY, env.OPENAI_BASE_URL, env.OPENAI_MODEL);
    return {
      provider,
      usage: { provider: provider.name, model: env.OPENAI_MODEL, isFallback: false, label: `Live model: ${env.OPENAI_MODEL}` },
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

export { AIError };
