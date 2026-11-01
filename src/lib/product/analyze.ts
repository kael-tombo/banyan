import { z } from "zod";
import { extractProductSnapshot, normalizeProductUrl } from "@/lib/product/intake";
import { parseFetchableUrl, SafeFetchError, type SafeFetchResult } from "@/lib/net/safe-fetch";
import { sanitizePageHtml, detectInstructionLikeText, wrapUntrusted, UNTRUSTED_CONTENT_RULES, type InjectionFlag } from "@/lib/ai/untrusted";
import { extractJSON } from "@/lib/ai/provider";

/**
 * Product analysis — US-021, US-022, US-025 (Workflow A in the brief).
 *
 * Reads at most three same-site public pages (home + pricing/about/features
 * when linked), isolates their text as untrusted data (US-024), and produces
 * a schema-validated profile. With a model, the output is validated and
 * retried once; if it is still invalid, or no model is configured, the
 * rule-based extraction is returned and labelled "basic". Nothing is invented:
 * what the pages do not say goes in missing_information.
 *
 * The core (analyzeProduct) takes its fetch and model functions as arguments,
 * so every path is unit-tested without network or database.
 */

export const PROMPT_VERSION = "product-analysis.v1";
const MAX_EXTRA_PAGES = 2;

export const analysisSchema = z.object({
  product_name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000),
  value_proposition: z.string().trim().max(500),
  features: z.array(z.string().trim().min(1).max(200)).max(12),
  target_audience: z.array(z.string().trim().min(1).max(200)).max(6),
  problems_solved: z.array(z.string().trim().min(1).max(300)).max(6),
  differentiators: z.array(z.string().trim().min(1).max(300)).max(6),
  missing_information: z.array(z.string().trim().min(1).max(200)).max(12),
  /** Field name → the page URL it came from, or "inferred". */
  provenance: z.record(z.string(), z.string()).default({}),
});
export type ProductAnalysisResult = z.infer<typeof analysisSchema>;

export type AnalysisErrorCode = "invalid_url" | "blocked_address" | "unreachable" | "timeout" | "http_error" | "not_html" | "empty_page";

export class AnalysisError extends Error {
  constructor(public readonly code: AnalysisErrorCode, message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "AnalysisError";
  }
}

/** One-sentence, user-facing messages (US-025). Each says what happened and what to do. */
export const ANALYSIS_ERROR_MESSAGES: Record<AnalysisErrorCode, string> = {
  invalid_url: "That does not look like a web address. Check it, or describe your product yourself.",
  blocked_address: "Banyan only reads public websites, and this address is private or internal. Use your public site, or describe your product yourself.",
  unreachable: "Banyan could not reach that site. Check the address, try again, or describe your product yourself.",
  timeout: "The site took too long to answer. Try again, or describe your product yourself.",
  http_error: "The site answered with an error page. Try your public home page, or describe your product yourself.",
  not_html: "That address is not a web page Banyan can read. Try your home page, or describe your product yourself.",
  empty_page: "The page has no readable text (it may need JavaScript). Describe your product yourself, and Banyan will use that.",
};

/** Validate and normalise a submitted URL before anything is fetched (US-021). */
export function validateProductUrl(raw: string): { ok: true; url: string } | { ok: false; code: AnalysisErrorCode; message: string } {
  // An explicit non-web scheme (ftp:, file:, javascript:) is refused, not rewritten to https.
  const trimmed = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed) && !/^[^:/]+:\d+(\/|$)/.test(trimmed)) {
    return { ok: false, code: "invalid_url", message: ANALYSIS_ERROR_MESSAGES.invalid_url };
  }
  const normalized = normalizeProductUrl(raw);
  try {
    const url = parseFetchableUrl(normalized); // static checks: protocol, literal private IPs
    // Obviously internal names are refused before any lookup; everything else is
    // still DNS-checked by safeFetch before it connects.
    if (/^(localhost|.*\.(localhost|local|internal|lan|home\.arpa))$/i.test(url.hostname)) {
      return { ok: false, code: "blocked_address", message: ANALYSIS_ERROR_MESSAGES.blocked_address };
    }
    return { ok: true, url: url.toString() };
  } catch (err) {
    if (err instanceof SafeFetchError && /private|reserved|localhost|internal/i.test(err.message)) {
      return { ok: false, code: "blocked_address", message: ANALYSIS_ERROR_MESSAGES.blocked_address };
    }
    return { ok: false, code: "invalid_url", message: ANALYSIS_ERROR_MESSAGES.invalid_url };
  }
}

/** Map a fetch failure to a user-facing analysis error. */
export function classifyFetchError(err: unknown): AnalysisError {
  if (err instanceof AnalysisError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (/timed out/i.test(message)) return new AnalysisError("timeout", ANALYSIS_ERROR_MESSAGES.timeout, true);
  if (/private|reserved|internal|localhost/i.test(message)) return new AnalysisError("blocked_address", ANALYSIS_ERROR_MESSAGES.blocked_address, false);
  if (/protocol|invalid/i.test(message)) return new AnalysisError("invalid_url", ANALYSIS_ERROR_MESSAGES.invalid_url, false);
  return new AnalysisError("unreachable", ANALYSIS_ERROR_MESSAGES.unreachable, true);
}

/** Same-site links worth reading: pricing, about, features, product. */
export function pickExtraPages(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const found: string[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && found.length < MAX_EXTRA_PAGES) {
    try {
      const u = new URL(m[1], base);
      if (u.hostname !== base.hostname || !/^https?:$/.test(u.protocol)) continue;
      if (!/\/(pricing|about|features|product)(\/|$)/i.test(u.pathname)) continue;
      u.search = "";
      u.hash = "";
      const s = u.toString();
      if (s !== base.toString() && !found.includes(s)) found.push(s);
    } catch {
      /* ignore malformed hrefs */
    }
  }
  return found;
}

function headings(html: string): string[] {
  const out: string[] = [];
  const re = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 8) {
    const t = sanitizePageHtml(m[1]);
    if (t.length >= 3 && t.length <= 120 && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Rule-based extraction: only what the pages state; everything else is listed as missing. */
export function basicAnalysis(pages: { url: string; html: string }[]): ProductAnalysisResult {
  const home = pages[0];
  const snap = extractProductSnapshot(home.html, home.url);
  const features = pages.flatMap((p) => headings(p.html)).slice(0, 8);
  const allText = pages.map((p) => sanitizePageHtml(p.html)).join("\n").toLowerCase();
  const missing = [
    !snap.description && "product description",
    !snap.valueProp && "value proposition",
    "target audience",
    "problems solved",
    "differentiators",
    // A stated price, not just the word "pricing" in a navigation link.
    !/[$€£]\s?\d|\d\s?(usd|eur|gbp)\b|per (month|year|user|seat)|\/mo\b|free plan|free tier|free for/.test(allText) && "pricing",
  ].filter(Boolean) as string[];
  const provenance: Record<string, string> = {};
  if (snap.name) provenance.product_name = home.url;
  if (snap.description) provenance.description = home.url;
  if (snap.valueProp) provenance.value_proposition = home.url;
  if (features.length) provenance.features = pages.map((p) => p.url).join(" ");
  return {
    product_name: snap.name || new URL(home.url).hostname,
    description: snap.description,
    value_proposition: snap.valueProp,
    features,
    target_audience: [],
    problems_solved: [],
    differentiators: [],
    missing_information: missing,
    provenance,
  };
}

export type Fetcher = (url: string) => Promise<SafeFetchResult>;
export type Completer = (args: { system: string; user: string }) => Promise<{ text: string; live: boolean }>;

export type AnalysisOutcome = {
  pages: string[];
  result: ProductAnalysisResult;
  method: "model" | "basic";
  flags: (InjectionFlag & { page: string })[];
  promptVersion: string | null;
};

function buildPrompt(pages: { url: string; text: string }[]): { system: string; user: string } {
  const system = [
    "You analyse a product's public website for a founder and return one JSON object.",
    UNTRUSTED_CONTENT_RULES,
    'JSON keys: product_name (string), description (string), value_proposition (string), features (string[]), target_audience (string[]), problems_solved (string[]), differentiators (string[]), missing_information (string[]), provenance (object mapping each field name to the page URL it came from, or "inferred").',
    "Use the founder's own words where possible. Leave a field empty and list it in missing_information when the pages do not support it.",
  ].join("\n");
  const user = pages.map((p) => wrapUntrusted(p.text, p.url).block).join("\n\n");
  return { system, user };
}

/** Fetch, isolate, analyse. Throws AnalysisError when the home page cannot be read. */
export async function analyzeProduct(
  rawUrl: string,
  deps: { fetch: Fetcher; complete?: Completer; onPhase?: (phase: "analysing") => Promise<void> | void },
): Promise<AnalysisOutcome> {
  const valid = validateProductUrl(rawUrl);
  if (!valid.ok) throw new AnalysisError(valid.code, valid.message, false);

  let home: SafeFetchResult;
  try {
    home = await deps.fetch(valid.url);
  } catch (err) {
    throw classifyFetchError(err);
  }
  if (home.status < 200 || home.status >= 300) throw new AnalysisError("http_error", ANALYSIS_ERROR_MESSAGES.http_error, home.status >= 500);
  const type = (home.headers.get("content-type") ?? "").toLowerCase();
  if (type && !type.includes("text/html") && !type.includes("application/xhtml")) throw new AnalysisError("not_html", ANALYSIS_ERROR_MESSAGES.not_html, false);

  const pages = [{ url: valid.url, html: home.text }];
  for (const extra of pickExtraPages(home.text, valid.url)) {
    try {
      const r = await deps.fetch(extra);
      if (r.status >= 200 && r.status < 300) pages.push({ url: extra, html: r.text });
    } catch {
      /* extra pages are best-effort */
    }
  }

  const texts = pages.map((p) => ({ url: p.url, text: sanitizePageHtml(p.html) }));
  if (texts.every((t) => t.text.length < 40)) throw new AnalysisError("empty_page", ANALYSIS_ERROR_MESSAGES.empty_page, false);
  const flags = texts.flatMap((t) => detectInstructionLikeText(t.text).map((f) => ({ ...f, page: t.url })));
  const basic = basicAnalysis(pages);
  await deps.onPhase?.("analysing");

  if (deps.complete) {
    const prompt = buildPrompt(texts);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await deps.complete(prompt);
        if (!res.live) break; // template fallback: the rule-based result is more honest
        const parsed = analysisSchema.safeParse(extractJSON(res.text));
        if (parsed.success) {
          return { pages: pages.map((p) => p.url), result: parsed.data, method: "model", flags, promptVersion: PROMPT_VERSION };
        }
      } catch {
        /* invalid JSON or provider error: retry once, then fall back */
      }
    }
  }
  return { pages: pages.map((p) => p.url), result: basic, method: "basic", flags, promptVersion: null };
}
