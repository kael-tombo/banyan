/**
 * Live trend sources: official APIs only, each read through an injected
 * fetcher (the SSRF-safe one in production). Parsers are pure and tested.
 *
 *   YouTube Data API v3   key       search.list (100 units) + videos.list (1 unit) per term
 *   Reddit                app OAuth top posts of the month for a term
 *   Bluesky               app password  top posts for a term
 *   Hacker News (Algolia) none      stories with the most points this quarter
 *   DEV                   none      top articles for a tag (developer products)
 */

import type { TrendItem } from "./types";

export type HttpFetch = (url: string, init?: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; json: unknown }>;

const DAY = 86_400_000;
const iso = (d: number) => new Date(d).toISOString();
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

export class PlatformError extends Error {}

// --- YouTube -------------------------------------------------------------------

export async function youtubeSearch(term: string, key: string, http: HttpFetch, now = Date.now()): Promise<TrendItem[]> {
  const after = iso(now - 90 * DAY);
  const q = encodeURIComponent(term);
  const search = await http(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=8&publishedAfter=${after}&q=${q}&key=${encodeURIComponent(key)}`,
  );
  if (search.status !== 200) throw new PlatformError(youtubeError(search.json));
  const ids = ((search.json as { items?: { id?: { videoId?: string } }[] }).items ?? []).map((i) => i.id?.videoId).filter(Boolean) as string[];
  if (ids.length === 0) return [];
  const stats = await http(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(",")}&key=${encodeURIComponent(key)}`);
  if (stats.status !== 200) throw new PlatformError(youtubeError(stats.json));
  return parseYoutubeVideos(stats.json, term);
}

function youtubeError(body: unknown): string {
  const reason = (body as { error?: { errors?: { reason?: string }[] } })?.error?.errors?.[0]?.reason;
  return reason === "quotaExceeded" ? "YouTube's daily quota for this key is used up." : "YouTube refused the request; check the API key.";
}

type YtVideo = {
  id?: string;
  snippet?: { title?: string; channelTitle?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

export function parseYoutubeVideos(body: unknown, term: string): TrendItem[] {
  return ((body as { items?: YtVideo[] }).items ?? [])
    .filter((v) => v.id && v.snippet?.title)
    .map((v) => ({
      id: `yt:${v.id}`,
      platform: "youtube" as const,
      title: clean(v.snippet?.title),
      url: `https://www.youtube.com/watch?v=${v.id}`,
      author: clean(v.snippet?.channelTitle),
      publishedAt: v.snippet?.publishedAt ?? "",
      views: num(v.statistics?.viewCount),
      likes: num(v.statistics?.likeCount),
      comments: num(v.statistics?.commentCount),
      thumbnail: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url,
      query: term,
    }))
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
}

// --- Reddit --------------------------------------------------------------------

const REDDIT_UA = "web:banyan-onboarding:1.0 (market research; contact via banyan-ai.app)";

export async function redditToken(id: string, secret: string, http: HttpFetch): Promise<string> {
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await http("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded", "user-agent": REDDIT_UA },
    body: "grant_type=client_credentials",
  });
  const token = (res.json as { access_token?: string })?.access_token;
  if (res.status !== 200 || !token) throw new PlatformError("Reddit refused the app credentials.");
  return token;
}

export async function redditSearch(term: string, token: string, http: HttpFetch): Promise<TrendItem[]> {
  const res = await http(`https://oauth.reddit.com/search?q=${encodeURIComponent(term)}&sort=top&t=month&limit=10&type=link`, {
    headers: { authorization: `Bearer ${token}`, "user-agent": REDDIT_UA },
  });
  if (res.status !== 200) throw new PlatformError(res.status === 429 ? "Reddit's rate limit was reached." : "Reddit search failed.");
  return parseRedditListing(res.json, term);
}

type RedditPost = { data?: { id?: string; title?: string; permalink?: string; author?: string; created_utc?: number; score?: number; num_comments?: number; subreddit_name_prefixed?: string; over_18?: boolean } };

export function parseRedditListing(body: unknown, term: string): TrendItem[] {
  return ((body as { data?: { children?: RedditPost[] } }).data?.children ?? [])
    .map((c) => c.data)
    .filter((d): d is NonNullable<RedditPost["data"]> => Boolean(d?.id && d.title && d.permalink && !d.over_18))
    .map((d) => ({
      id: `rd:${d.id}`,
      platform: "reddit" as const,
      title: clean(d.title),
      url: `https://www.reddit.com${d.permalink}`,
      author: d.subreddit_name_prefixed ?? (d.author ? `u/${d.author}` : ""),
      publishedAt: d.created_utc ? iso(d.created_utc * 1000) : "",
      score: d.score,
      comments: d.num_comments,
      query: term,
    }));
}

// --- Bluesky -------------------------------------------------------------------

export async function blueskySession(handle: string, password: string, http: HttpFetch): Promise<string> {
  const res = await http("https://bsky.social/xrpc/com.atproto.server.createSession", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: handle, password }),
  });
  const jwt = (res.json as { accessJwt?: string })?.accessJwt;
  if (res.status !== 200 || !jwt) throw new PlatformError("Bluesky refused the handle or app password.");
  return jwt;
}

export async function blueskySearch(term: string, jwt: string, http: HttpFetch): Promise<TrendItem[]> {
  const res = await http(`https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(term)}&sort=top&limit=10`, {
    headers: { authorization: `Bearer ${jwt}` },
  });
  if (res.status !== 200) throw new PlatformError("Bluesky search failed.");
  return parseBlueskyPosts(res.json, term);
}

type BskyPost = { uri?: string; author?: { handle?: string }; record?: { text?: string; createdAt?: string }; likeCount?: number; repostCount?: number; replyCount?: number };

export function parseBlueskyPosts(body: unknown, term: string): TrendItem[] {
  return ((body as { posts?: BskyPost[] }).posts ?? [])
    .filter((p) => p.uri && p.author?.handle && p.record?.text)
    .map((p) => {
      const rkey = p.uri!.split("/").pop();
      const text = clean(p.record?.text);
      return {
        id: `bs:${rkey}`,
        platform: "bluesky" as const,
        title: text.length > 200 ? `${text.slice(0, 199)}…` : text,
        url: `https://bsky.app/profile/${p.author!.handle}/post/${rkey}`,
        author: `@${p.author!.handle}`,
        publishedAt: p.record?.createdAt ?? "",
        likes: p.likeCount,
        comments: p.replyCount,
        score: p.repostCount,
        query: term,
      };
    });
}

// --- Hacker News (top stories by points, no key) ------------------------------------

export async function hnTopStories(term: string, http: HttpFetch, now = Date.now()): Promise<TrendItem[]> {
  const since = Math.floor((now - 365 * DAY) / 1000);
  const res = await http(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(term)}&tags=story&restrictSearchableAttributes=title&numericFilters=created_at_i>${since},points>2&hitsPerPage=12`,
  );
  if (res.status !== 200) throw new PlatformError("Hacker News search failed.");
  const hits = (res.json as { hits?: { objectID?: string; title?: string; author?: string; points?: number; num_comments?: number; created_at?: string }[] }).hits ?? [];
  return hits
    .filter((h) => h.objectID && h.title)
    .map((h) => ({
      id: `hn:${h.objectID}`,
      platform: "hacker_news" as const,
      title: clean(h.title),
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      author: h.author ?? "",
      publishedAt: h.created_at ?? "",
      score: h.points ?? undefined,
      comments: h.num_comments ?? undefined,
      query: term,
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

// --- DEV (developer products; tag-based, no key) ------------------------------------

export async function devTopArticles(tag: string, http: HttpFetch): Promise<TrendItem[]> {
  const res = await http(`https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&top=90&per_page=8`);
  if (res.status !== 200) throw new PlatformError("DEV search failed.");
  return ((res.json as { id?: number; title?: string; url?: string; user?: { name?: string }; published_at?: string; positive_reactions_count?: number; comments_count?: number; cover_image?: string | null }[]) ?? [])
    .filter((a) => a.id && a.title && a.url)
    .map((a) => ({
      id: `dev:${a.id}`,
      platform: "dev" as const,
      title: clean(a.title),
      url: a.url!,
      author: clean(a.user?.name),
      publishedAt: a.published_at ?? "",
      likes: a.positive_reactions_count,
      comments: a.comments_count,
      thumbnail: a.cover_image ?? undefined,
      query: `#${tag}`,
    }));
}

/** "Meeting scheduling" → "meetingscheduling": the form most platforms' hashtags take. */
export function toHashtag(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join("");
}
