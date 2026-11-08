import { z } from "zod";
import { extractProductSnapshot, normalizeProductUrl } from "@/lib/product/intake";
import { parseFetchableUrl, SafeFetchError, type SafeFetchResult } from "@/lib/net/safe-fetch";
import { sanitizePageHtml, detectInstructionLikeText, type InjectionFlag } from "@/lib/ai/untrusted";
import { promptKey, renderPrompt, type PromptRef } from "@/lib/ai/prompts/registry";
import { productAnalysisV2 } from "@/lib/ai/prompts/product-analysis.v2";
import { extractJSON } from "@/lib/ai/provider";
import { extractSiteSignals, mergeSignals, signalsDigest, type SiteSignals } from "@/lib/product/site-signals";

/**
 * Product analysis — US-021, US-022, US-025 (Workflow A in the brief).
 *
 * Reads the home page plus up to four same-site public pages (pricing, about,
 * features, customers, use cases…), parses their signals (meta tags,
 * structured data, hero, calls to action, prices, proof), isolates their text
 * as untrusted data (US-024), and produces a schema-validated positioning
 * profile. With a model, the output is validated and retried once; if it is
 * still invalid, or no model is configured, the rule-based extraction is
 * returned and labelled "basic". Nothing is invented: what the pages do not
 * say goes in missing_information.
 *
 * The core (analyzeProduct) takes its fetch and model functions as arguments,
 * so every path is unit-tested without network or database.
 */

/** The prompt this workflow uses (see src/lib/ai/prompts). */
export const ANALYSIS_PROMPT = productAnalysisV2;
export const PROMPT_VERSION = promptKey(ANALYSIS_PROMPT);
const MAX_EXTRA_PAGES = 4;
const HOME_TEXT_CHARS = 12_000;
const EXTRA_TEXT_CHARS = 6_000;

const STAGE_VALUES = ["idea", "building", "private_beta", "public_beta", "launched", "growth"] as const;
/**
 * Lenient on size, strict on shape: a model that lists 15 good features
 * should not lose the whole analysis. Over-long lists and text are trimmed
 * (at a word boundary); a wrong type is still invalid and triggers the retry.
 */
const cut = (s: string, len: number) => {
  const t = s.trim();
  if (t.length <= len) return t;
  const head = t.slice(0, len - 1); // room for the ellipsis: the result never exceeds len
  const space = head.lastIndexOf(" ");
  return (space > len * 0.6 ? head.slice(0, space) : head).replace(/[\s,;:]+$/, "") + "…";
};
const trimmedList = (max: number, len: number) =>
  z.array(z.string()).transform((a) => a.map((s) => cut(s, len)).filter(Boolean).slice(0, max));
const list = (max: number, len: number) => trimmedList(max, len).default([]);
const trimmedText = (len: number) => z.string().transform((s) => cut(s, len));
const text = (len: number) => trimmedText(len).default("");

/** What the parser saw on the site, kept with the analysis for the review screen. */
export const siteSummarySchema = z.object({
  logo: z.string().default(""),
  image: z.string().default(""),
  themeColor: z.string().default(""),
  language: z.string().default(""),
  ctas: z.array(z.string()).default([]),
  socials: z.array(z.object({ network: z.string(), url: z.string() })).default([]),
});
export type SiteSummary = z.infer<typeof siteSummarySchema>;

export const analysisSchema = z.object({
  product_name: z.string().trim().min(1).transform((s) => cut(s, 120)),
  description: trimmedText(1000),
  value_proposition: trimmedText(500),
  features: trimmedList(12, 200),
  target_audience: trimmedList(6, 200),
  problems_solved: trimmedList(6, 300),
  differentiators: trimmedList(6, 300),
  missing_information: trimmedList(12, 200),
  /** Field name → the page URL it came from, or "inferred". A list of pages is joined. */
  provenance: z
    .record(z.string(), z.unknown())
    .default({})
    .transform((r) =>
      Object.fromEntries(
        Object.entries(r)
          .map(([k, v]): [string, string] => [k, Array.isArray(v) ? v.filter((x) => typeof x === "string").join(" ") : typeof v === "string" ? v : ""])
          .filter(([, v]) => v),
      ),
    ),
  // v2 fields. Defaults keep v1 results (stored before v2) valid.
  tagline: text(200),
  category: text(120),
  stage: z.union([z.enum(STAGE_VALUES), z.literal("")]).catch("").default(""),
  audience_pain: text(600),
  audience_outcome: text(600),
  positioning: text(500),
  pricing: text(600),
  proof: list(8, 300),
  primary_cta: text(80),
  tone: text(80),
  alternatives: list(6, 120),
  site: siteSummarySchema.optional(),
});
export type ProductAnalysisResult = z.infer<typeof analysisSchema>;

// Most useful first: pricing and about say the most about positioning.
const PAGE_PRIORITY: RegExp[] = [
  /\/(pricing|plans|price)(\/|$)/i,
  /\/(about|about-us|company|story|mission)(\/|$)/i,
  /\/(features|product|how-it-works|platform|tour)(\/|$)/i,
  /\/(customers|case-studies|testimonials|use-cases|solutions|why[-\w]*)(\/|$)/i,
  /\/(faq|faqs)(\/|$)/i,
];

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
  if (/could not be resolved/i.test(message)) return new AnalysisError("unreachable", "That address doesn't point to a website yet. Check the spelling, or describe your product yourself.", false);
  if (/private|reserved|internal|localhost/i.test(message)) return new AnalysisError("blocked_address", ANALYSIS_ERROR_MESSAGES.blocked_address, false);
  if (/protocol|invalid/i.test(message)) return new AnalysisError("invalid_url", ANALYSIS_ERROR_MESSAGES.invalid_url, false);
  return new AnalysisError("unreachable", ANALYSIS_ERROR_MESSAGES.unreachable, true);
}


/** Same-site links worth reading (pricing, about, features, customers…), most useful first. */
export function pickExtraPages(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const ranked: { url: string; rank: number; order: number }[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  let order = 0;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], base);
      // www.example.com and example.com are the same site.
      if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "") || !/^https?:$/.test(u.protocol)) continue;
      const rank = PAGE_PRIORITY.findIndex((p) => p.test(u.pathname));
      if (rank < 0) continue;
      u.search = "";
      u.hash = "";
      const s = u.toString();
      if (s === base.toString() || ranked.some((r) => r.url === s)) continue;
      ranked.push({ url: s, rank, order: order++ });
    } catch {
      /* ignore malformed hrefs */
    }
  }
  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
  // One page per kind first, so five pricing sub-pages never crowd out "about".
  const picked: string[] = [];
  const seenRank = new Set<number>();
  for (const r of ranked) if (!seenRank.has(r.rank) && picked.length < MAX_EXTRA_PAGES) { picked.push(r.url); seenRank.add(r.rank); }
  for (const r of ranked) if (!picked.includes(r.url) && picked.length < MAX_EXTRA_PAGES) picked.push(r.url);
  return picked;
}

function headings(html: string): string[] {
  const out: string[] = [];
  const re = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 8) {
    const t = sanitizePageHtml(m[1]).replace(/\s+/g, " ").trim();
    if (t.length >= 3 && t.length <= 120 && !out.includes(t)) out.push(t);
  }
  return out;
}

function siteSummary(s: SiteSignals): SiteSummary {
  return { logo: s.logo, image: s.image, themeColor: s.themeColor, language: s.language, ctas: s.ctas, socials: s.socials };
}

/** Rule-based extraction: only what the pages state; everything else is listed as missing. */
export function basicAnalysis(pages: { url: string; html: string }[], signals?: SiteSignals): ProductAnalysisResult {
  const home = pages[0];
  const snap = extractProductSnapshot(home.html, home.url);
  const sig = signals ?? mergeSignals(pages.map((p) => extractSiteSignals(p.html, p.url)));
  const features = pages.flatMap((p) => headings(p.html)).slice(0, 8);
  const allText = pages.map((p) => sanitizePageHtml(p.html)).join("\n").toLowerCase();
  const statesPrice = /[$€£]\s?\d|\d\s?(usd|eur|gbp)\b|per (month|year|user|seat)|\/mo\b|free plan|free tier|free for/.test(allText);
  const pricing = statesPrice ? sig.prices.slice(0, 4).join(" · ") : "";
  // The hero headline is the site's own promise; the lead usually explains it.
  const tagline = sig.headline && sig.headline !== snap.name ? sig.headline : "";
  const description = snap.description || sig.lead;
  const valueProp = snap.valueProp || tagline || sig.lead.slice(0, 500);
  const audience = sig.audiencePhrases.slice(0, 3);
  const pain = sig.painPhrases[0] ?? "";
  const missing = [
    !description && "product description",
    !valueProp && "value proposition",
    audience.length === 0 && "target audience",
    "problems solved",
    "differentiators",
    !statesPrice && "pricing",
  ].filter(Boolean) as string[];
  const provenance: Record<string, string> = {};
  if (snap.name) provenance.product_name = home.url;
  if (description) provenance.description = home.url;
  if (valueProp) provenance.value_proposition = home.url;
  if (tagline) provenance.tagline = home.url;
  if (features.length) provenance.features = pages.map((p) => p.url).join(" ");
  if (audience.length) provenance.target_audience = sig.url;
  if (pain) provenance.audience_pain = sig.url;
  if (pricing) provenance.pricing = pages.find((p) => /pric|plan/i.test(p.url))?.url ?? home.url;
  if (sig.proof.length) provenance.proof = home.url;
  if (sig.ctas[0]) provenance.primary_cta = home.url;
  if (sig.stageHint) provenance.stage = "inferred";
  // Structured data often gives only a code ("BusinessApplication"); the title's
  // second half usually names the category in words ("Scheduling Software for Online Bookings").
  const tail = titleTail(sig.title, snap.name);
  const category = sig.category && /\s/.test(sig.category) ? sig.category : tail || sig.category;
  if (category) provenance.category = home.url;
  const alternatives = alternativesNamed([tail, sig.headline, sig.lead, sig.metaDescription], snap.name);
  if (alternatives.length) provenance.alternatives = home.url;
  return {
    product_name: snap.name || new URL(home.url).hostname,
    description,
    value_proposition: valueProp,
    features,
    target_audience: audience,
    problems_solved: [],
    differentiators: [],
    missing_information: missing,
    provenance,
    tagline,
    category,
    stage: sig.stageHint ?? "",
    audience_pain: pain,
    audience_outcome: "",
    positioning: "",
    pricing,
    proof: sig.proof.slice(0, 6),
    primary_cta: sig.ctas[0] ?? "",
    tone: "",
    alternatives,
    site: siteSummary(sig),
  };
}

/** "Cal.com | Scheduling Software for Online Bookings" → "Scheduling Software for Online Bookings". */
export function titleTail(title: string, name: string): string {
  const parts = title.split(/\s+[|–—·-]\s+|:\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return "";
  const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const rest = parts.filter((p) => slug(p) !== slug(name) && !slug(p).startsWith(slug(name)));
  const best = rest.sort((a, b) => b.length - a.length)[0] ?? "";
  const words = best.split(/\s+/).length;
  return words >= 2 && words <= 10 ? best.slice(0, 120) : "";
}

/** Competitors a page names itself: "Google Analytics alternative", "alternative to Calendly". */
export function alternativesNamed(texts: string[], ownName: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\b(?:alternative to|instead of|replacement for|switch(?:ing)? from)\s+([A-Z][\w.]*(?:\s[A-Z][\w.]*){0,2})/g,
    /\b([A-Z][\w.]*(?:\s[A-Z][\w.]*){0,2})\s+alternative\b/g,
  ];
  const generic = /^(The|A|An|Simple|Open|Free|Better|Best|Modern|Privacy|Easy|Fast|Lightweight|Great)$/;
  for (const t of texts) {
    for (const re of patterns) {
      for (const m of (t || "").matchAll(re)) {
        const name = m[1].split(/\s+/).filter((w, i, all) => !(i === 0 && generic.test(w) && all.length > 1)).join(" ");
        if (!name || generic.test(name) || name.toLowerCase() === ownName.toLowerCase() || out.includes(name)) continue;
        out.push(name);
      }
    }
  }
  return out.slice(0, 4);
}

export type Fetcher = (url: string) => Promise<SafeFetchResult>;
/**
 * Calls the model. `report`, when returned, records whether the output
 * passed schema validation against the call that produced it (US-045).
 */
export type Completer = (args: {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  prompt: PromptRef;
  attempt: number;
}) => Promise<{ text: string; live: boolean; report?: (schemaValid: boolean) => Promise<void> | void }>;

export type AnalysisOutcome = {
  pages: string[];
  result: ProductAnalysisResult;
  method: "model" | "basic";
  flags: (InjectionFlag & { page: string })[];
  promptVersion: string | null;
};

/** The same site under the other common host: example.com ⇄ www.example.com. */
export function alternateHost(url: string): string | null {
  try {
    const u = new URL(url);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.includes(":")) return null;
    u.hostname = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
    return u.toString();
  } catch {
    return null;
  }
}

/** Fetch, isolate, analyse. Throws AnalysisError when the home page cannot be read. */
export async function analyzeProduct(
  rawUrl: string,
  deps: { fetch: Fetcher; complete?: Completer; onPhase?: (phase: "analysing") => Promise<void> | void },
): Promise<AnalysisOutcome> {
  const valid = validateProductUrl(rawUrl);
  if (!valid.ok) throw new AnalysisError(valid.code, valid.message, false);

  let homeUrl = valid.url;
  let home: SafeFetchResult;
  try {
    home = await deps.fetch(homeUrl);
  } catch (err) {
    // A domain often lives on only one of example.com / www.example.com.
    const other = err instanceof SafeFetchError && /could not be resolved|could not be completed/i.test(err.message) ? alternateHost(homeUrl) : null;
    if (!other) throw classifyFetchError(err);
    try {
      home = await deps.fetch(other);
      homeUrl = other;
    } catch {
      throw classifyFetchError(err);
    }
  }
  if (home.status < 200 || home.status >= 300) throw new AnalysisError("http_error", ANALYSIS_ERROR_MESSAGES.http_error, home.status >= 500);
  const type = (home.headers.get("content-type") ?? "").toLowerCase();
  if (type && !type.includes("text/html") && !type.includes("application/xhtml")) throw new AnalysisError("not_html", ANALYSIS_ERROR_MESSAGES.not_html, false);

  // Extra pages are best-effort and read in parallel.
  const extras = await Promise.allSettled(pickExtraPages(home.text, homeUrl).map(async (u) => ({ url: u, res: await deps.fetch(u) })));
  const pages = [{ url: homeUrl, html: home.text }];
  for (const r of extras) {
    if (r.status !== "fulfilled") continue;
    const { url, res } = r.value;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (res.status >= 200 && res.status < 300 && (!ct || ct.includes("html"))) pages.push({ url, html: res.text });
  }

  const signals = mergeSignals(pages.map((p) => extractSiteSignals(p.html, p.url)));
  const texts = pages.map((p, i) => ({ url: p.url, text: sanitizePageHtml(p.html).slice(0, i === 0 ? HOME_TEXT_CHARS : EXTRA_TEXT_CHARS) }));
  // A JavaScript-only page can still describe itself in its meta tags.
  const hasMeta = Boolean(signals.metaDescription || signals.headline);
  if (texts.every((t) => t.text.length < 40) && !hasMeta) throw new AnalysisError("empty_page", ANALYSIS_ERROR_MESSAGES.empty_page, false);
  const digest = signalsDigest(signals);
  const flags = [...texts, { url: homeUrl, text: digest }].flatMap((t) => detectInstructionLikeText(t.text).map((f) => ({ ...f, page: t.url })));
  const basic = basicAnalysis(pages, signals);
  await deps.onPhase?.("analysing");

  if (deps.complete) {
    const prompt = renderPrompt(ANALYSIS_PROMPT, { pages: texts, signals: digest, signalsSource: homeUrl });
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await deps.complete({ system: prompt.system, user: prompt.user, maxTokens: prompt.maxTokens, temperature: prompt.temperature, prompt: prompt.ref, attempt });
        if (!res.live) break; // template fallback: the rule-based result is more honest
        let parsed: ReturnType<typeof analysisSchema.safeParse> | null = null;
        try {
          parsed = analysisSchema.safeParse(extractJSON(res.text));
        } finally {
          await res.report?.(Boolean(parsed?.success));
        }
        if (parsed.success) {
          const result = withParsedFacts(parsed.data, basic);
          return { pages: pages.map((p) => p.url), result, method: "model", flags, promptVersion: PROMPT_VERSION };
        }
      } catch {
        /* invalid JSON or provider error: retry once, then fall back */
      }
    }
  }
  return { pages: pages.map((p) => p.url), result: basic, method: "basic", flags, promptVersion: null };
}

/**
 * The model may leave a field empty that the parser read directly from the
 * page (a price in structured data, a button label). Fill those gaps from the
 * parser, and always attach the parser's site summary.
 */
function withParsedFacts(model: ProductAnalysisResult, basic: ProductAnalysisResult): ProductAnalysisResult {
  const out: ProductAnalysisResult = { ...model, provenance: { ...model.provenance }, site: basic.site };
  const fill = <K extends "tagline" | "pricing" | "primary_cta" | "category" | "audience_pain">(key: K) => {
    if (!out[key] && basic[key]) {
      out[key] = basic[key];
      if (basic.provenance[key]) out.provenance[key] = basic.provenance[key];
    }
  };
  fill("tagline");
  fill("pricing");
  fill("primary_cta");
  fill("category");
  fill("audience_pain");
  if (out.proof.length === 0 && basic.proof.length) {
    out.proof = basic.proof;
    if (basic.provenance.proof) out.provenance.proof = basic.provenance.proof;
  }
  if (!out.stage && basic.stage) out.stage = basic.stage;
  out.missing_information = out.missing_information.filter((m) => !(/pric/i.test(m) && out.pricing));
  return out;
}
