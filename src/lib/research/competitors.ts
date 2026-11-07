/**
 * Competitors, checked against their own websites. A candidate (named on the
 * founder's site, or suggested by the model) becomes "verified" only when its
 * home page loads and names it; its tagline, pricing and main button are then
 * read with the same parser as the founder's site. Nothing about a competitor
 * is written from memory.
 */

import { extractSiteSignals } from "@/lib/product/site-signals";
import { extractProductSnapshot } from "@/lib/product/intake";
import type { SafeFetchResult } from "@/lib/net/safe-fetch";
import type { Competitor, CompetitorSource } from "./types";

export type CompetitorCandidate = { name: string; domain?: string; reason?: string; source: CompetitorSource };

export const MAX_COMPETITORS = 5;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** "https://www.cal.com/x" → "cal.com"; a bare name gets a ".com" guess. */
export function candidateUrl(c: CompetitorCandidate): string | null {
  const raw = (c.domain ?? "").trim();
  if (raw) {
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!/\./.test(u.hostname)) return null;
      return `https://${u.hostname.replace(/^www\./, "")}/`;
    } catch {
      return null;
    }
  }
  const s = slug(c.name);
  return s.length >= 3 ? `https://${s}.com/` : null;
}

/** The page is about this competitor when its title, site name or domain carries the name. */
export function pageNamesCompetitor(name: string, html: string, url: string): boolean {
  const s = slug(name);
  if (!s) return false;
  const sig = extractSiteSignals(html, url);
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  // Not the hostname: a guessed name.com always "contains" the name, even when parked.
  return [sig.title, sig.siteName, sig.headline].some((t) => slug(t).includes(s));
}

export function dedupeCandidates(list: CompetitorCandidate[], ownName: string, ownUrl: string): CompetitorCandidate[] {
  const own = slug(ownName);
  let ownHost = "";
  try {
    ownHost = new URL(ownUrl).hostname.replace(/^www\./, "");
  } catch {
    /* no own URL */
  }
  const seen = new Set<string>();
  const out: CompetitorCandidate[] = [];
  // Named-on-site first: the founder's own comparison outranks a suggestion.
  for (const c of [...list].sort((a, b) => (a.source === b.source ? 0 : a.source === "named_on_site" ? -1 : 1))) {
    const key = slug(c.name);
    const url = candidateUrl(c);
    const host = url ? new URL(url).hostname : "";
    if (!key || key === own || (ownHost && host === ownHost) || seen.has(key)) continue;
    // "Zoom / Google Meet", "email back-and-forth" or "spreadsheets" are the
    // status quo, not one company whose site can be read.
    const n = c.name.trim();
    if (/[/,&+]| or |\balternative\b|\bvs\.?(\s|$)/i.test(n) || n.split(/\s+/).length > 4) continue;
    if (/\b(spreadsheets?|excel|e-?mail|manual(ly)?|status ?quo|doing nothing|in-?house|custom (code|build)|agenc(y|ies)|freelancers?|back-and-forth|pen and paper|word of mouth)\b/i.test(n)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.slice(0, MAX_COMPETITORS);
}

export async function readCompetitor(c: CompetitorCandidate, fetch: (url: string) => Promise<SafeFetchResult>): Promise<Competitor> {
  const url = candidateUrl(c);
  const base: Competitor = {
    id: `c:${slug(c.name)}`,
    name: c.name.trim().slice(0, 80),
    url: url ?? "",
    source: c.source,
    reason: (c.reason ?? "").trim().slice(0, 240),
    verified: false,
    tagline: "",
    description: "",
    pricing: "",
    cta: "",
    logo: "",
  };
  if (!url) return base;
  try {
    const res = await fetch(url);
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (res.status < 200 || res.status >= 300 || (type && !type.includes("html"))) return base;
    if (!pageNamesCompetitor(c.name, res.text, url)) return base;
    const sig = extractSiteSignals(res.text, url);
    const snap = extractProductSnapshot(res.text, url);
    return {
      ...base,
      verified: true,
      tagline: sig.headline && sig.headline !== snap.name ? sig.headline : "",
      description: (snap.description || sig.lead).slice(0, 300),
      pricing: sig.prices.slice(0, 2).join(" · ").slice(0, 200),
      cta: sig.ctas[0] ?? "",
      logo: sig.logo,
    };
  } catch {
    return base;
  }
}
