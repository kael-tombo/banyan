/**
 * The trend radar (onboarding 360, "What's trending"). Reads every platform
 * that has an official API Banyan may use, gives research links for the rest,
 * measures interest with Wikipedia page views, and proposes platform-native
 * content ideas built on what was found. See docs/ONBOARDING_360.md.
 */

import { z } from "zod";
import { extractJSON } from "@/lib/ai/provider";
import { promptKey, renderPrompt } from "@/lib/ai/prompts/registry";
import { contentIdeasV1 } from "@/lib/ai/prompts/content-ideas.v1";
import type { Completer } from "@/lib/product/analyze";
import { titleRelevance } from "@/lib/research/sources";
import {
  blueskySearch, blueskySession, devTopArticles, hnTopStories, redditSearch, redditToken, toHashtag, youtubeSearch, PlatformError, type HttpFetch,
} from "./providers";
import { googleTrendsLink, hashtagsFor, researchLinks } from "./links";
import { interestFor } from "./interest";
import type { ContentIdea, InterestSeries, PlatformId, PlatformReport, ResearchLink, TrendItem, TrendsReport } from "./types";
import { PLATFORM_LABEL } from "./types";

export const IDEAS_PROMPT_VERSION = promptKey(contentIdeasV1);

export type RadarKeys = {
  youtube?: string;
  redditId?: string;
  redditSecret?: string;
  blueskyHandle?: string;
  blueskyPassword?: string;
};

export type RadarInput = {
  productName: string;
  description: string;
  audience: string;
  pain: string;
  terms: string[];
  competitors: string[];
  developer: boolean;
};

export type RadarDeps = { http: HttpFetch; keys: RadarKeys; complete?: Completer };

/** Platforms with no public search API: research links only, never scraped. */
const NO_API_NOTE: Partial<Record<PlatformId, string>> = {
  tiktok: "TikTok has no public search API, so Banyan doesn't read it. These open TikTok's own search and trend charts.",
  instagram: "Instagram has no public search API. These open its hashtag pages and the Meta Ad Library.",
  facebook: "Facebook has no public search API. These open Facebook search, groups, and what competitors advertise in the Meta Ad Library.",
  linkedin: "LinkedIn has no public search API. These open LinkedIn's post search and its Ad Library.",
  x: "X's search API is paid. These open X's own search.",
  pinterest: "Pinterest's trends API needs partner approval. These open Pinterest search and Pinterest Trends.",
};

const NEEDS_KEY_NOTE: Partial<Record<PlatformId, string>> = {
  youtube: "Add a YouTube Data API key (free) to list the most-viewed recent videos here. Meanwhile, these open YouTube sorted by views.",
  reddit: "Add a Reddit app (and Reddit's approval for commercial use) to list this month's top posts here. Meanwhile, these open Reddit's search.",
  bluesky: "Add a Bluesky handle and app password to list top posts here. Meanwhile, these open Bluesky search.",
};

const ORDER: PlatformId[] = ["youtube", "tiktok", "instagram", "facebook", "reddit", "linkedin", "x", "bluesky", "pinterest", "hacker_news", "dev"];

const nameIn = (title: string, name: string) => title.toLowerCase().includes(name.toLowerCase());

/** Keep items about the term (most of its words) or naming the competitor. */
function relevant(items: TrendItem[], competitors: string[]): TrendItem[] {
  return items.filter((i) => (competitors.includes(i.query) ? nameIn(i.title, i.query) : titleRelevance(i.title, i.query) >= 0.5));
}

function dedupe(items: TrendItem[]): TrendItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

async function gather(
  platform: PlatformId,
  queries: string[],
  competitors: string[],
  run: (q: string) => Promise<TrendItem[]>,
  rank: (i: TrendItem) => number,
): Promise<{ items: TrendItem[]; error?: string }> {
  const results = await Promise.allSettled(queries.map(run));
  const ok = results.filter((r): r is PromiseFulfilledResult<TrendItem[]> => r.status === "fulfilled");
  if (ok.length === 0) {
    const first = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    const reason = first?.reason instanceof PlatformError ? first.reason.message : `${PLATFORM_LABEL[platform]} didn't answer.`;
    return { items: [], error: reason };
  }
  return { items: dedupe(relevant(ok.flatMap((r) => r.value), competitors)).sort((a, b) => rank(b) - rank(a)).slice(0, 8) };
}

export async function runTrendRadar(input: RadarInput, deps: RadarDeps): Promise<TrendsReport> {
  const terms = [...new Set(input.terms.map((t) => t.trim()).filter(Boolean))].slice(0, 3);
  const competitors = [...new Set(input.competitors.map((c) => c.trim()).filter(Boolean))].slice(0, 3);
  const queries = [...terms, ...competitors.slice(0, 2)];
  const { http, keys } = deps;

  const live: Partial<Record<PlatformId, Promise<{ items: TrendItem[]; error?: string }>>> = {};
  if (keys.youtube) {
    // 101 quota units per search: two terms and one competitor per scan.
    live.youtube = gather("youtube", [...terms.slice(0, 2), ...competitors.slice(0, 1)], competitors, (q) => youtubeSearch(q, keys.youtube!, http), (i) => i.views ?? 0);
  }
  if (keys.redditId && keys.redditSecret) {
    live.reddit = redditToken(keys.redditId, keys.redditSecret, http).then(
      (token) => gather("reddit", queries, competitors, (q) => redditSearch(q, token, http), (i) => (i.score ?? 0) + (i.comments ?? 0) * 2),
      (e) => ({ items: [], error: e instanceof PlatformError ? e.message : "Reddit didn't answer." }),
    );
  }
  if (keys.blueskyHandle && keys.blueskyPassword) {
    live.bluesky = blueskySession(keys.blueskyHandle, keys.blueskyPassword, http).then(
      (jwt) => gather("bluesky", queries, competitors, (q) => blueskySearch(q, jwt, http), (i) => (i.likes ?? 0) + (i.score ?? 0) * 2),
      (e) => ({ items: [], error: e instanceof PlatformError ? e.message : "Bluesky didn't answer." }),
    );
  }
  live.hacker_news = gather("hacker_news", queries, competitors, (q) => hnTopStories(q, http), (i) => (i.score ?? 0) + (i.comments ?? 0));
  if (input.developer) {
    const tags = [...new Set(terms.flatMap((t) => t.toLowerCase().split(/\s+/)).filter((w) => /^[a-z]{3,20}$/.test(w)))].slice(0, 2);
    // DEV searches by single-word tag ("meeting"), which is noisy: an article
    // must also match one of the real search terms in its title.
    live.dev = Promise.allSettled(tags.map((tag) => devTopArticles(tag, http))).then((results) => {
      const okResults = results.filter((r): r is PromiseFulfilledResult<TrendItem[]> => r.status === "fulfilled");
      if (okResults.length === 0) return { items: [], error: "DEV didn't answer." };
      const items = dedupe(okResults.flatMap((r) => r.value))
        .filter((i) => terms.some((t) => titleRelevance(i.title, t) >= 0.67))
        .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
        .slice(0, 8);
      return { items };
    });
  }

  const interestPromise = Promise.allSettled([...competitors, input.productName, ...terms.slice(0, 1)].map((l) => interestFor(l, http)));

  const reports: PlatformReport[] = [];
  const baseTags = hashtagsFor(terms, input.productName);
  for (const platform of ORDER) {
    if (platform === "dev" && !input.developer) continue;
    const links = researchLinks(platform, terms, competitors);
    const pending = live[platform];
    if (pending) {
      const r = await pending;
      reports.push({
        platform,
        status: r.error ? "failed" : "live",
        note: r.error ?? (r.items.length ? "" : `Nothing recent and relevant on ${PLATFORM_LABEL[platform]} for these terms.`),
        items: r.items,
        links,
        hashtags: baseTags,
      });
    } else {
      reports.push({
        platform,
        status: NEEDS_KEY_NOTE[platform] ? "needs_key" : "no_api",
        note: NEEDS_KEY_NOTE[platform] ?? NO_API_NOTE[platform] ?? "",
        items: [],
        links,
        hashtags: baseTags,
      });
    }
  }

  const interest: InterestSeries[] = (await interestPromise)
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((s): s is InterestSeries => Boolean(s))
    .filter((s, i, all) => all.findIndex((x) => x.article === s.article) === i);

  let method: "model" | "basic" = "basic";
  let ideas: ContentIdea[] = [];
  if (deps.complete) {
    const out = await modelIdeas(input, reports, deps.complete);
    if (out) {
      method = "model";
      ideas = out.ideas;
      for (const r of reports) {
        const extra = out.hashtags[r.platform];
        if (extra?.length) r.hashtags = [...new Set([...extra, ...r.hashtags])].slice(0, 8);
      }
    }
  }
  if (ideas.length === 0) ideas = ruleIdeas(input, reports);

  return { method, terms, platforms: reports, interest, ideas, generatedAt: new Date().toISOString() };
}

/** Links shown above the platform tabs: interest in Google's own tool. */
export function radarLinks(report: TrendsReport, competitors: string[]): ResearchLink[] {
  const g = googleTrendsLink([...competitors.slice(0, 3), ...report.terms.slice(0, 2)]);
  return g ? [g] : [];
}

const ideasSchema = z.object({
  ideas: z
    .array(
      z.object({
        platform: z.string(),
        format: z.string().trim().min(2).max(60),
        hook: z.string().trim().min(3).max(200),
        angle: z.string().trim().min(5).max(400),
        basis_ids: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  hashtags: z.record(z.string(), z.array(z.string())).default({}),
});

async function modelIdeas(
  input: RadarInput,
  reports: PlatformReport[],
  complete: Completer,
): Promise<{ ideas: ContentIdea[]; hashtags: Partial<Record<PlatformId, string[]>> } | null> {
  const byId = new Map<string, TrendItem>();
  const lines: string[] = [
    `Product: ${input.productName}`,
    input.description && `What it does: ${input.description}`,
    input.audience && `Audience: ${input.audience}`,
    input.pain && `Their pain: ${input.pain}`,
    input.competitors.length ? `Competitors: ${input.competitors.join(", ")}` : "",
    "",
    "Posts found:",
  ];
  let n = 0;
  for (const r of reports) {
    for (const item of r.items.slice(0, 5)) {
      const id = `T${++n}`;
      byId.set(id, item);
      const metrics = [item.views && `${item.views} views`, item.score && `score ${item.score}`, item.likes && `${item.likes} likes`, item.comments && `${item.comments} comments`].filter(Boolean).join(", ");
      lines.push(`[${id}] ${PLATFORM_LABEL[r.platform]}: "${item.title}"${metrics ? ` (${metrics})` : ""}`);
    }
  }
  if (n === 0) lines.push("(none found)");
  const platforms = reports.map((r) => r.platform);
  lines.push("", `Platforms to cover (ids): ${platforms.join(", ")}`);

  const prompt = renderPrompt(contentIdeasV1, { brief: lines.join("\n"), source: "trend radar" });
  try {
    const res = await complete({ system: prompt.system, user: prompt.user, maxTokens: prompt.maxTokens, temperature: prompt.temperature, prompt: prompt.ref, attempt: 1 });
    if (!res.live) return null;
    let parsed: ReturnType<typeof ideasSchema.safeParse> | null = null;
    try {
      parsed = ideasSchema.safeParse(extractJSON(res.text));
    } finally {
      await res.report?.(Boolean(parsed?.success));
    }
    if (!parsed?.success) return null;
    const ideas: ContentIdea[] = [];
    for (const idea of parsed.data.ideas) {
      const platform = idea.platform as PlatformId;
      if (!platforms.includes(platform)) continue;
      // A cited post must be one found on this platform; anything else is dropped from the basis.
      const basis = idea.basis_ids
        .map((id) => byId.get(id.replace(/[[\]\s]/g, "")))
        .filter((i): i is TrendItem => Boolean(i && i.platform === platform))
        .map((i) => ({ label: i.title, url: i.url }));
      ideas.push({
        id: `i:${ideas.length + 1}`,
        platform,
        format: idea.format,
        hook: idea.hook,
        angle: idea.angle,
        basis: basis.length ? basis : [{ label: "Suggestion: nothing found on this platform to build on" }],
        source: "model",
      });
    }
    const hashtags: Partial<Record<PlatformId, string[]>> = {};
    for (const [k, v] of Object.entries(parsed.data.hashtags)) {
      if (!platforms.includes(k as PlatformId)) continue;
      hashtags[k as PlatformId] = v
        .map((t) => `#${toHashtag(t.replace(/^#/, ""))}`)
        .filter((t) => t.length > 3)
        .slice(0, 6);
    }
    return ideas.length ? { ideas, hashtags } : null;
  } catch {
    return null;
  }
}

const NATIVE: Partial<Record<PlatformId, { format: string; hook: (p: RadarInput) => string; angle: (p: RadarInput) => string }>> = {
  youtube: { format: "Tutorial video (6–10 min)", hook: (p) => `How I'd solve ${shortPain(p)} in 10 minutes`, angle: (p) => `A real walkthrough of the job ${p.productName} does, recorded as you'd do it.` },
  tiktok: { format: "Short video (30–45 s)", hook: (p) => `POV: ${shortPain(p)}`, angle: () => "Show the before in 3 seconds, the after in 20. One idea, filmed on a phone." },
  instagram: { format: "Carousel (6 slides)", hook: (p) => `${shortPain(p)}? Swipe →`, angle: () => "One slide per step from the problem to the fix; the last slide asks one question." },
  facebook: { format: "Helpful post in a group", hook: () => "Sharing what finally worked for us", angle: (p) => `Answer a question your audience asks in their groups; mention ${p.productName} only if asked.` },
  reddit: { format: "Helpful comment", hook: () => "We ran into exactly this", angle: () => "Answer the question in the thread first; add what you built only where the subreddit's rules allow it." },
  linkedin: { format: "Text post (founder story)", hook: (p) => `We built ${p.productName} because ${shortPain(p)}.`, angle: () => "A short, specific story: the moment, the mistake, what you changed." },
  x: { format: "Thread (5 posts)", hook: (p) => `${shortPain(p)}. Here's what we learned fixing it:`, angle: () => "Five short lessons, one per post; the last links to the product." },
  bluesky: { format: "Short post", hook: (p) => `Small thing we shipped for ${p.audience || "our users"}:`, angle: () => "One concrete change and why; Bluesky rewards plain and specific." },
  pinterest: { format: "Pin (infographic)", hook: (p) => `${shortPain(p)}: a 5-step checklist`, angle: () => "A tall checklist image that links to a guide on your site." },
  hacker_news: { format: "Show HN post", hook: (p) => `Show HN: ${p.productName} – ${p.description.slice(0, 60)}`, angle: () => "Plain title, a first comment on why you built it and what's still rough." },
  dev: { format: "Technical article", hook: (p) => `How we built ${p.productName}`, angle: () => "The one technical decision you'd defend, with code." },
};

function shortPain(p: RadarInput): string {
  const s = (p.pain || p.description || p.productName).replace(/[.!?].*$/, "").trim();
  return s.length > 60 ? `${s.slice(0, 57).replace(/\s+\S*$/, "")}…` : s;
}

/** Without a model: one native-format idea per platform, built on its top post when there is one. */
export function ruleIdeas(input: RadarInput, reports: PlatformReport[]): ContentIdea[] {
  const out: ContentIdea[] = [];
  for (const r of reports) {
    const n = NATIVE[r.platform];
    if (!n) continue;
    const top = r.items[0];
    out.push({
      id: `i:${out.length + 1}`,
      platform: r.platform,
      format: n.format,
      hook: n.hook(input),
      angle: top ? `${n.angle(input)} Start from what already works here: “${top.title.slice(0, 80)}”.` : n.angle(input),
      basis: top ? [{ label: top.title, url: top.url }] : [{ label: "Suggestion: nothing found on this platform to build on" }],
      source: "rule",
    });
  }
  return out;
}
