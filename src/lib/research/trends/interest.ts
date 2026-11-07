/**
 * Interest over time from Wikipedia page views (Wikimedia REST API, public,
 * no key). A real, citable measure: how many people read about a competitor
 * or category each month. Only exact title matches are used, so "Calendly"
 * means the Calendly article and nothing looser.
 */

import type { HttpFetch } from "./providers";
import type { InterestSeries } from "./types";

const UA = { "user-agent": "BanyanBot/1.0 (market research; banyan-ai.app)", "api-user-agent": "BanyanBot/1.0 (banyan-ai.app)" };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The article whose title matches `name` exactly (ignoring case and punctuation), or null. */
export async function findArticle(name: string, http: HttpFetch): Promise<string | null> {
  const res = await http(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=3&namespace=0&format=json`, { headers: UA });
  if (res.status !== 200 || !Array.isArray(res.json)) return null;
  const titles = (res.json[1] ?? []) as string[];
  return titles.find((t) => slug(t) === slug(name)) ?? null;
}

const ym = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}01`;

export async function monthlyViews(article: string, http: HttpFetch, now = new Date()): Promise<{ month: string; views: number }[]> {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 86_400_000); // last full month
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const res = await http(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(article.replace(/ /g, "_"))}/monthly/${ym(start)}/${ym(end)}`,
    { headers: UA },
  );
  if (res.status !== 200) return [];
  return ((res.json as { items?: { timestamp?: string; views?: number }[] }).items ?? [])
    .filter((i) => i.timestamp && typeof i.views === "number")
    .map((i) => ({ month: `${i.timestamp!.slice(0, 4)}-${i.timestamp!.slice(4, 6)}`, views: i.views! }));
}

/** Last three months against the three before, in percent. */
export function changePct(months: { views: number }[]): number | null {
  if (months.length < 6) return null;
  const last = months.slice(-3).reduce((s, m) => s + m.views, 0);
  const prev = months.slice(-6, -3).reduce((s, m) => s + m.views, 0);
  if (prev === 0) return null;
  return Math.round(((last - prev) / prev) * 100);
}

/**
 * Drop a last month that is far below the months before it: the newest month
 * can come back before Wikimedia has finished counting it, which would show as
 * a fake collapse.
 */
export function dropIncompleteTail(months: { month: string; views: number }[]): { month: string; views: number }[] {
  if (months.length < 4) return months;
  const prior = months.slice(-4, -1).map((m) => m.views).sort((a, b) => a - b)[1];
  return months[months.length - 1].views < prior * 0.25 ? months.slice(0, -1) : months;
}

/** Below this, an article is too small for its changes to mean anything. */
export const MIN_MONTHLY_VIEWS = 100;

export async function interestFor(label: string, http: HttpFetch): Promise<InterestSeries | null> {
  const article = await findArticle(label, http);
  if (!article) return null;
  const months = dropIncompleteTail(await monthlyViews(article, http));
  if (months.length < 3) return null;
  const average = months.reduce((s, m) => s + m.views, 0) / months.length;
  if (average < MIN_MONTHLY_VIEWS) return null;
  return { label, article, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(article.replace(/ /g, "_"))}`, months, change: changePct(months) };
}
