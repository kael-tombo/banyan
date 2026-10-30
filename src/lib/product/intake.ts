/**
 * Product intake — a deterministic, honest snapshot of a public product page.
 *
 * This module is deliberately pure (no network, no model): the route fetches
 * the page through the SSRF-safe fetcher, and this code turns the HTML into
 * editable fields. It reads only what the page says — title, Open Graph and
 * meta description, and the first heading when no description exists. It does
 * not invent a problem, an audience or a value proposition. Those are the
 * founder's call, and the cycle form asks for them explicitly.
 */

export type ProductStage =
  | "idea"
  | "building"
  | "private_beta"
  | "public_beta"
  | "launched"
  | "growth";

export type ProductSnapshot = {
  name: string;
  description: string;
  website: string;
  stage: ProductStage;
  problem: string;
  valueProp: string;
  audience: string;
  audiencePain: string;
  audienceOutcome: string;
  /** Fields that came from the page rather than the founder's correction. */
  observedFields: string[];
};

const GENERIC_TITLES = new Set([
  "home",
  "homepage",
  "welcome",
  "index",
  "untitled",
  "new tab",
  "loading",
]);

/** Accept a bare domain and normalize it to https; leave explicit protocols alone. */
export function normalizeProductUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return " ";
      }
    })
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      try {
        return String.fromCodePoint(Number(decimal));
      } catch {
        return " ";
      }
    })
    // Ampersand last so `&amp;lt;` does not become a tag.
    .replace(/&amp;/gi, "&");
}

/** Strip markup, decode entities, collapse whitespace, and cap length. */
function cleanText(input: string, max = 2000): string {
  const withoutCode = input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutCode.replace(/<[^>]*>/g, " ");
  return decodeEntities(withoutTags).replace(/\s+/g, " ").trim().slice(0, max);
}

function attributesOf(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function readMeta(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = attributesOf(tag);
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content && !map.has(key)) {
      map.set(key, attrs.content);
    }
  }
  return map;
}

function textOfTag(html: string, tag: string): string {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? cleanText(match[1]) : "";
}

/**
 * Prefer an explicit site name; otherwise use the left side of a title that
 * reads "Product — tagline" or "Product | tagline". Fall back to the hostname
 * so the snapshot always has a name to edit.
 */
function productName(candidates: string[], hostname: string): string {
  for (const candidate of candidates) {
    const cleaned = cleanText(candidate, 120);
    if (!cleaned || GENERIC_TITLES.has(cleaned.toLowerCase())) continue;
    const left = cleaned.split(/\s+[|—–]\s+/)[0].trim();
    return (left || cleaned).slice(0, 120);
  }
  return hostname.replace(/^www\./, "").slice(0, 120);
}

export function extractProductSnapshot(html: string, rawUrl: string): ProductSnapshot {
  let website = rawUrl.slice(0, 300);
  let hostname = "";
  try {
    const parsed = new URL(rawUrl);
    website = parsed.toString().slice(0, 300);
    hostname = parsed.hostname;
  } catch {
    // The route validates the URL first; a malformed value still yields a
    // usable, empty snapshot rather than throwing.
  }

  const meta = readMeta(html);
  const title = textOfTag(html, "title");
  const h1 = textOfTag(html, "h1");
  const siteName = cleanText(meta.get("og:site_name") || meta.get("application-name") || "", 120);
  // Title before h1: an h1 is frequently the tagline ("A calmer way to…"),
  // while the title usually names the product. A generic title is skipped and
  // the h1 becomes the fallback in productName().
  const name = productName(
    [siteName, meta.get("og:title") || "", meta.get("twitter:title") || "", title, h1],
    hostname
  );

  const metaDescription = cleanText(
    meta.get("og:description") || meta.get("twitter:description") || meta.get("description") || "",
    2000
  );
  // A heading is a reasonable description fallback only when it is not just
  // the product name repeated. Never scrape arbitrary paragraphs — navigation
  // and cookie copy would leak into the snapshot as if it were positioning.
  const headingFallback = h1 && h1 !== name && h1.length >= 20 ? h1.slice(0, 2000) : "";
  const description = metaDescription || headingFallback;
  const valueProp = description.slice(0, 500);

  const observedFields: string[] = [];
  if (name) observedFields.push("name");
  if (description) observedFields.push("description");
  if (valueProp) observedFields.push("valueProp");

  return {
    name,
    description,
    website,
    stage: "launched",
    problem: "",
    valueProp,
    audience: "",
    audiencePain: "",
    audienceOutcome: "",
    observedFields,
  };
}
