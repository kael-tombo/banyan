/**
 * Site signals — everything a public product page states about itself that a
 * parser can read without a model: structured data (JSON-LD), meta tags, the
 * hero copy, headings, calls to action, prices, proof, audience phrases, stage
 * hints, social profiles and the logo.
 *
 * Pure (no network, no model) and conservative: every value is copied from
 * the page, never composed. The model analysis receives these signals as
 * untrusted data alongside the page text; without a model they fill the
 * founder's review screen directly, each one labelled with the page it came from.
 */

import { sanitizePageHtml } from "@/lib/ai/untrusted";

export type ProductStageHint = "idea" | "building" | "private_beta" | "public_beta" | "launched" | "growth";

export type SiteSignals = {
  url: string;
  siteName: string;
  title: string;
  metaDescription: string;
  /** The hero headline (first h1). */
  headline: string;
  /** The first substantial paragraph near the top: usually the sub-headline. */
  lead: string;
  headings: string[];
  /** Button and link labels that ask the visitor to act ("Start free trial"). */
  ctas: string[];
  /** Sentences that state a price or a plan ("Pro is $9 per month"). */
  prices: string[];
  /** Sentences that state proof: customers, counts, ratings, testimonials. */
  proof: string[];
  /** Phrases naming who it is for ("for freelance designers"). */
  audiencePhrases: string[];
  /** Sentences that describe a pain ("tired of chasing invoices"). */
  painPhrases: string[];
  stageHint: ProductStageHint | null;
  category: string;
  logo: string;
  image: string;
  themeColor: string;
  language: string;
  socials: { network: string; url: string }[];
};

const MAX_LIST = 8;

function decode(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => safeChar(Number(d)))
    .replace(/&amp;/gi, "&");
}

function safeChar(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
}

function text(fragment: string, max = 400): string {
  return decode(fragment.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim().slice(0, max);
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

function pushUnique(list: string[], value: string, max = MAX_LIST): void {
  const v = value.replace(/\s+/g, " ").trim();
  if (!v || list.length >= max) return;
  if (list.some((x) => x.toLowerCase() === v.toLowerCase())) return;
  list.push(v);
}

function absolute(href: string, base: string): string {
  try {
    const u = new URL(href, base);
    return /^https?:$/.test(u.protocol) ? u.toString() : "";
  } catch {
    return "";
  }
}

/** Strip page chrome that would leak navigation, cookie or footer copy into the signals. */
function bodyWithoutChrome(html: string): string {
  let s = html.replace(/<head\b[\s\S]*?<\/head>/i, " ");
  for (const tag of ["script", "style", "noscript", "template", "svg", "nav", "footer", "iframe"]) {
    s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), " ");
  }
  s = s.replace(/<([a-z]+)\b[^>]*(?:cookie|consent|gdpr)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  return s;
}

function readMeta(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = attrs(tag);
    const key = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (key && a.content && !map.has(key)) map.set(key, a.content.trim());
  }
  return map;
}

type JsonLd = Record<string, unknown>;

function readJsonLd(html: string): JsonLd[] {
  const out: JsonLd[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim()) as unknown;
      const queue: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      while (queue.length && out.length < 20) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        const obj = item as JsonLd;
        if (Array.isArray(obj["@graph"])) queue.push(...(obj["@graph"] as unknown[]));
        out.push(obj);
      }
    } catch {
      /* malformed JSON-LD is common; skip it */
    }
  }
  return out;
}

function ldTypes(obj: JsonLd): string[] {
  const t = obj["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
}

function ldString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object" && typeof (v as JsonLd).url === "string") return ((v as JsonLd).url as string).trim();
  return "";
}

const CTA_PATTERN =
  /^(start|try|get|sign ?up|join|book|request|schedule|download|install|create|claim|apply|buy|subscribe|contact sales|talk to|see (a )?demo|watch (the )?demo|launch|explore|build)\b/i;
const CTA_NOISE = /^(get in touch|get the app on|download on the app store|get it on google play)$/i;

const SOCIALS: [string, RegExp][] = [
  ["x", /^https?:\/\/(www\.)?(x|twitter)\.com\/(?!intent|share|home)[A-Za-z0-9_]{1,30}\/?$/i],
  ["linkedin", /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(company|in|showcase)\/[^/?#]+\/?$/i],
  ["youtube", /^https?:\/\/(www\.)?youtube\.com\/(@|c\/|channel\/|user\/)[^/?#]+\/?$/i],
  ["instagram", /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/i],
  ["tiktok", /^https?:\/\/(www\.)?tiktok\.com\/@[^/?#]+\/?$/i],
  ["github", /^https?:\/\/(www\.)?github\.com\/[^/?#]+\/?$/i],
  ["producthunt", /^https?:\/\/(www\.)?producthunt\.com\/(products|posts)\/[^/?#]+\/?$/i],
  ["discord", /^https?:\/\/(www\.)?discord\.(gg|com\/invite)\/[^/?#]+\/?$/i],
];

// A price is a currency amount with a billing period or plan word, or a stated
// free plan. "$10K MRR" and "10M+ calls per month" are not prices.
const CURRENCY = /[$€£]\s?\d[\d,.]*(?![\d,.]|\s?[kmb]\b|\+)|\b\d[\d,.]*\s?(usd|eur|gbp)\b/i;
const PERIOD = /\bper (month|year|user|seat|member)\b|\/\s?(mo|month|yr|year|user|seat)\b|\bmonthly\b|\byearly\b|\bbilled\b|\bannually\b(?! saving)|\bone-time\b|\blifetime\b|\bplan\b/i;
const FREE_PLAN = /\bfree (plan|tier|forever)\b|\bfree for (individuals|everyone|personal|one|up to|\d)|\b\d+-day free trial\b/i;
const PROOF =
  /(\btrusted by\b|\bloved by\b|\bjoin(ed)? (over |more than )?\d|\b\d[\d,.]*\s?(k|\+)?\s?(customers|users|teams|companies|founders|developers|creators|businesses|downloads|reviews)\b|\brated \d|\b\d(\.\d)?\s?\/\s?5\b|\b\d(\.\d)? stars? on\b|\bproduct hunt\b.*\b(#\d|of the (day|week))|\bbacked by\b|\bas seen (in|on)\b)/i;
const AUDIENCE =
  /\b(built|made|designed|perfect|crafted|tailored) for ([^.!?\n]{3,90})|\bfor (solo |indie |small |busy |modern |growing |remote |b2b |saas |early-stage |non-technical |technical )?(founders|teams|startups|freelancers|creators|developers|designers|marketers|agencies|businesses|companies|engineers|product managers|recruiters|sales teams|students|teachers|clinics|restaurants|shops|e-?commerce [a-z]+|[a-z]+ teams)\b[^.!?\n]{0,60}/i;
const PAIN =
  /\b(tired of|sick of|no more|stop (wasting|chasing|juggling|losing|guessing)|struggl(e|ing) (to|with)|without (the )?(hassle|headache|spreadsheets|chaos|guesswork)|hours (spent|wasted)|frustrat(ed|ing)|painful|messy|scattered|overwhelm(ed|ing)?)\b/i;

const isPrice = (s: string, onPricingPage: boolean) => FREE_PLAN.test(s) || (CURRENCY.test(s) && (PERIOD.test(s) || onPricingPage));

/** "A B C A B C" → "A B C": animated headlines often repeat their text in the markup. */
export function collapseRepeats(s: string): string {
  const words = s.split(" ");
  for (let k = 1; k <= words.length / 2; k++) {
    if (words.length % k !== 0) continue;
    const chunk = words.slice(0, k).join(" ");
    let same = true;
    for (let i = k; i < words.length && same; i += k) same = words.slice(i, i + k).join(" ") === chunk;
    if (same) return chunk;
  }
  return s;
}

/** Cut a phrase at a word boundary. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).replace(/[,;:\s]+$/, "");
}

function splitSentences(t: string): string[] {
  return t
    .split(/\n|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 240);
}

/** All visible text: used for prices on a pricing page, where plans live in divs. */
function sentences(body: string): string[] {
  return splitSentences(sanitizePageHtml(body));
}

/**
 * Text from elements people write prose in (paragraphs, headings, list items,
 * quotes). Product screenshots built from divs and spans stay out, so a mock
 * task list never becomes a "pain" or a "customer".
 */
function proseSentences(body: string, tags = "p|h[1-4]|li|blockquote|figcaption|dd"): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(new RegExp(`<(${tags})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "gi"))) {
    out.push(...splitSentences(collapseRepeats(text(m[2], 600))));
  }
  return out;
}

function stageFrom(identity: string, textLower: string, ctas: string[]): ProductStageHint | null {
  const ctaText = ctas.join(" ").toLowerCase();
  if (/\b(join|get on) (the )?waitlist\b|\bcoming soon\b|\bjoin the beta\b|\brequest (early )?access\b/.test(ctaText + " " + identity)) {
    return /\bprivate beta\b|\binvite[- ]only\b|\brequest (early )?access\b/.test(textLower) ? "private_beta" : /\bcoming soon\b|\bwaitlist\b/.test(textLower) ? "building" : "private_beta";
  }
  // "Beta" counts only where the product names itself: title, hero, buttons.
  if (/\bpublic beta\b|\bopen beta\b|\(beta\)|\bbeta\b/.test(identity)) return "public_beta";
  if (/\btrusted by\b|\b\d[\d,.]*\s?(k|\+)?\s?(customers|teams|companies)\b/.test(textLower)) return "growth";
  return null;
}

/** Read the signals from one page. `url` is the page's final address. */
export function extractSiteSignals(html: string, url: string): SiteSignals {
  const meta = readMeta(html);
  const ld = readJsonLd(html);
  const body = bodyWithoutChrome(html);

  const title = text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "", 200);
  const headline = collapseRepeats(text(body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "", 600)).slice(0, 200);

  // Lead: the first real paragraph after the headline (or anywhere, if there is no h1).
  let lead = "";
  const afterH1 = headline ? body.slice(body.search(/<\/h1>/i) + 5) : body;
  for (const m of afterH1.matchAll(/<(p|h2)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = collapseRepeats(text(m[2], 400));
    if (t.length >= 40 && !/cookie|javascript|browser|©|all rights reserved/i.test(t)) {
      lead = t;
      break;
    }
  }

  const headings: string[] = [];
  for (const m of body.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)) {
    const t = text(m[1], 140);
    if (t.length >= 3 && t !== headline) pushUnique(headings, t, 12);
  }

  const ctas: string[] = [];
  for (const m of body.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const label = text(m[3], 60);
    if (label.length < 3 || label.length > 40 || CTA_NOISE.test(label)) continue;
    const a = attrs(`<x ${m[2]}>`);
    const looksLikeButton = m[1].toLowerCase() === "button" || /\b(btn|button|cta)\b/i.test(a.class ?? "") || a.role === "button";
    if (CTA_PATTERN.test(label) && (looksLikeButton || /\b(free|trial|demo|started|now|today|waitlist|access)\b/i.test(label))) {
      pushUnique(ctas, label, 5);
    }
  }

  const prices: string[] = [];
  const proof: string[] = [];
  const audiencePhrases: string[] = [];
  const painPhrases: string[] = [];
  let onPricingPage = false;
  try {
    onPricingPage = /\/(pricing|plans|price)(\/|$)/i.test(new URL(url).pathname);
  } catch {
    /* not a URL: treat as a normal page */
  }
  if (onPricingPage) for (const s of sentences(body)) if (isPrice(s, true)) pushUnique(prices, s, 6);
  for (const s of proseSentences(body)) {
    if (isPrice(s, onPricingPage)) pushUnique(prices, s, 6);
    if (PROOF.test(s)) pushUnique(proof, s, 6);
    const aud = s.match(AUDIENCE);
    if (aud) pushUnique(audiencePhrases, clip((aud[2] ? aud[2] : aud[0].replace(/^for\s+/i, "")).replace(/[,;:]\s*$/, ""), 80), 4);
  }
  // Pain is stated in headings and paragraphs; list items are too often a mock task list.
  for (const s of proseSentences(body, "p|h[1-3]")) {
    if (PAIN.test(s) && s.length <= 200) pushUnique(painPhrases, s, 4);
  }
  for (const m of body.matchAll(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi)) {
    const t = text(m[1], 240);
    if (t.length >= 20) pushUnique(proof, `“${t.replace(/^["“]|["”]$/g, "")}”`, 6);
  }

  // Structured data: the most reliable source when a site provides it.
  let ldName = "";
  let ldNameIsProduct = false;
  let ldDescription = "";
  let category = "";
  let logo = "";
  const socials: { network: string; url: string }[] = [];
  for (const obj of ld) {
    const types = ldTypes(obj);
    const isProduct = types.some((t) => /softwareapplication|webapplication|mobileapplication|product|service/.test(t));
    const isOrg = types.some((t) => /organization|corporation|localbusiness|website/.test(t));
    if (!isProduct && !isOrg) continue;
    // A product's own name beats the company's; the first of each kind wins.
    const n = ldString(obj.name);
    if (n && (!ldName || (isProduct && !ldNameIsProduct))) {
      ldName = n;
      ldNameIsProduct = isProduct;
    }
    if (!ldDescription) ldDescription = ldString(obj.description);
    if (!category) category = ldString(obj.applicationCategory) || ldString(obj.category);
    if (!logo) logo = ldString(obj.logo) || ldString(obj.image);
    const offers = (Array.isArray(obj.offers) ? obj.offers : obj.offers ? [obj.offers] : []) as JsonLd[];
    for (const o of offers) {
      const price = o.price ?? o.lowPrice;
      const cur = typeof o.priceCurrency === "string" ? o.priceCurrency : "";
      if (price !== undefined && price !== null && String(price) !== "") {
        pushUnique(prices, `${ldString(o.name) || "Plan"}: ${String(price) === "0" ? "free" : `${price}${cur ? ` ${cur}` : ""}`}`, 6);
      }
    }
    const rating = obj.aggregateRating as JsonLd | undefined;
    if (rating && rating.ratingValue) {
      pushUnique(proof, `Rated ${rating.ratingValue}${rating.bestRating ? `/${rating.bestRating}` : ""}${rating.ratingCount || rating.reviewCount ? ` from ${rating.ratingCount ?? rating.reviewCount} reviews` : ""}`, 6);
    }
    const sameAs = (Array.isArray(obj.sameAs) ? obj.sameAs : obj.sameAs ? [obj.sameAs] : []) as unknown[];
    for (const s of sameAs) if (typeof s === "string") addSocial(socials, s);
  }

  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) addSocial(socials, m[1]);

  if (!logo) {
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
      const a = attrs(tag);
      if (/apple-touch-icon/i.test(a.rel ?? "") && a.href) logo = a.href;
    }
  }
  if (!logo) {
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
      const a = attrs(tag);
      if (/\bicon\b/i.test(a.rel ?? "") && a.href && !logo) logo = a.href;
    }
  }

  const lower = sanitizePageHtml(body).toLowerCase();
  return {
    url,
    siteName: text(meta.get("og:site_name") || meta.get("application-name") || ldName || "", 120),
    title,
    metaDescription: text(meta.get("og:description") || meta.get("description") || meta.get("twitter:description") || ldDescription || "", 600),
    headline,
    lead,
    headings,
    ctas,
    prices,
    proof,
    audiencePhrases,
    painPhrases,
    stageHint: stageFrom([title, headline, lead].join(" ").toLowerCase(), lower, ctas),
    category: text(category, 80),
    logo: logo ? absolute(logo, url) : "",
    image: meta.get("og:image") ? absolute(meta.get("og:image")!, url) : "",
    themeColor: /^#[0-9a-f]{3,8}$/i.test(meta.get("theme-color") ?? "") ? meta.get("theme-color")! : "",
    language: (html.match(/<html\b[^>]*\blang\s*=\s*["']?([a-zA-Z-]{2,10})/i)?.[1] ?? "").toLowerCase(),
    socials,
  };
}

function addSocial(list: { network: string; url: string }[], href: string): void {
  const url = href.trim().replace(/\/$/, "");
  for (const [network, re] of SOCIALS) {
    if (re.test(url + "/") || re.test(url)) {
      if (!list.some((s) => s.network === network) && list.length < 8) list.push({ network, url });
      return;
    }
  }
}

/** Merge the signals of several pages (home first): the home page wins for identity fields. */
export function mergeSignals(all: SiteSignals[]): SiteSignals {
  const [home, ...rest] = all;
  const merged: SiteSignals = { ...home, headings: [...home.headings], ctas: [...home.ctas], prices: [...home.prices], proof: [...home.proof], audiencePhrases: [...home.audiencePhrases], painPhrases: [...home.painPhrases], socials: [...home.socials] };
  for (const s of rest) {
    for (const h of s.headings) pushUnique(merged.headings, h, 16);
    for (const c of s.ctas) pushUnique(merged.ctas, c, 5);
    for (const p of s.prices) pushUnique(merged.prices, p, 8);
    for (const p of s.proof) pushUnique(merged.proof, p, 8);
    for (const a of s.audiencePhrases) pushUnique(merged.audiencePhrases, a, 5);
    for (const p of s.painPhrases) pushUnique(merged.painPhrases, p, 5);
    for (const so of s.socials) if (!merged.socials.some((x) => x.network === so.network)) merged.socials.push(so);
    merged.category ||= s.category;
    merged.stageHint ??= s.stageHint;
    merged.logo ||= s.logo;
  }
  return merged;
}

/** A compact, human-readable rendering of the signals for the model (sent inside an untrusted fence). */
export function signalsDigest(s: SiteSignals): string {
  const lines: string[] = [];
  const add = (label: string, v: string | string[]) => {
    const value = Array.isArray(v) ? v.filter(Boolean).join(" | ") : v;
    if (value) lines.push(`${label}: ${value}`);
  };
  add("Site name", s.siteName);
  add("Title tag", s.title);
  add("Meta description", s.metaDescription);
  add("Hero headline", s.headline);
  add("Hero sub-headline", s.lead);
  add("Category (structured data)", s.category);
  add("Calls to action", s.ctas);
  add("Price statements", s.prices);
  add("Proof statements", s.proof);
  add("Audience phrases", s.audiencePhrases);
  add("Pain phrases", s.painPhrases);
  add("Stage hint", s.stageHint ?? "");
  add("Section headings", s.headings);
  return lines.join("\n");
}
