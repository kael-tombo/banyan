/**
 * Research links for platforms Banyan cannot read: each opens the platform's
 * own search, sorted toward what is popular where the platform allows it, in
 * the founder's browser (signed in, under the platform's own terms). Public ad
 * libraries show what competitors are paying to promote right now.
 */

import type { PlatformId, ResearchLink } from "./types";
import { toHashtag } from "./providers";

const enc = encodeURIComponent;

export function researchLinks(platform: PlatformId, terms: string[], competitors: string[]): ResearchLink[] {
  const t = terms.slice(0, 3);
  const c = competitors.slice(0, 3);
  switch (platform) {
    case "tiktok":
      return [
        ...t.map((q) => ({ label: `Search “${q}”`, url: `https://www.tiktok.com/search?q=${enc(q)}` })),
        ...t.map((q) => ({ label: `#${toHashtag(q)}`, url: `https://www.tiktok.com/tag/${enc(toHashtag(q))}` })),
        { label: "Trending hashtags (Creative Center)", url: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en", hint: "TikTok's own trend charts, by country and industry" },
        { label: "Top ads (Creative Center)", url: "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en", hint: "Best-performing ads by industry" },
      ];
    case "instagram":
      return [
        ...t.map((q) => ({ label: `#${toHashtag(q)}`, url: `https://www.instagram.com/explore/tags/${enc(toHashtag(q))}/` })),
        ...c.map((n) => ({ label: `${n} ads (Meta Ad Library)`, url: metaAdLibrary(n), hint: "Ads running now on Instagram and Facebook" })),
      ];
    case "facebook":
      return [
        ...t.map((q) => ({ label: `Posts about “${q}”`, url: `https://www.facebook.com/search/posts/?q=${enc(q)}` })),
        ...t.slice(0, 2).map((q) => ({ label: `Groups about “${q}”`, url: `https://www.facebook.com/search/groups/?q=${enc(q)}` })),
        ...c.map((n) => ({ label: `${n} ads (Meta Ad Library)`, url: metaAdLibrary(n), hint: "Every ad they run, with start dates" })),
      ];
    case "linkedin":
      return [
        ...t.map((q) => ({ label: `Posts about “${q}”`, url: `https://www.linkedin.com/search/results/content/?keywords=${enc(q)}` })),
        ...c.map((n) => ({ label: `${n} ads (LinkedIn Ad Library)`, url: `https://www.linkedin.com/ad-library/search?companyName=${enc(n)}` })),
      ];
    case "x":
      return [
        ...t.map((q) => ({ label: `Top posts: “${q}”`, url: `https://x.com/search?q=${enc(q)}&f=top` })),
        ...c.map((n) => ({ label: `People talking about ${n}`, url: `https://x.com/search?q=${enc(`"${n}" -from:${n.replace(/\W/g, "")}`)}&f=live` })),
      ];
    case "pinterest":
      return [
        ...t.map((q) => ({ label: `Pins: “${q}”`, url: `https://www.pinterest.com/search/pins/?q=${enc(q)}` })),
        { label: "Pinterest Trends", url: "https://trends.pinterest.com/", hint: "Search interest on Pinterest, by region" },
      ];
    case "youtube":
      return t.map((q) => ({ label: `Most viewed: “${q}”`, url: `https://www.youtube.com/results?search_query=${enc(q)}&sp=CAM%253D` }));
    case "reddit":
      return [
        ...t.map((q) => ({ label: `Top this month: “${q}”`, url: `https://www.reddit.com/search/?q=${enc(q)}&sort=top&t=month` })),
        ...c.map((n) => ({ label: `“${n} alternative”`, url: `https://www.reddit.com/search/?q=${enc(`${n} alternative`)}&sort=top&t=year` })),
      ];
    case "bluesky":
      return t.map((q) => ({ label: `Search “${q}”`, url: `https://bsky.app/search?q=${enc(q)}` }));
    case "hacker_news":
      return t.map((q) => ({ label: `“${q}” on HN`, url: `https://hn.algolia.com/?q=${enc(q)}&sort=byPopularity&type=story&dateRange=pastYear` }));
    case "dev":
      return t.map((q) => ({ label: `#${toHashtag(q)} on DEV`, url: `https://dev.to/t/${enc(toHashtag(q))}/top/year` }));
  }
}

function metaAdLibrary(name: string): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${enc(name)}&search_type=keyword_unordered&media_type=all`;
}

/** Google Trends comparison of up to five terms: search interest over 12 months, opened in Google's own tool. */
export function googleTrendsLink(terms: string[]): ResearchLink | null {
  const q = terms.filter(Boolean).slice(0, 5);
  if (q.length === 0) return null;
  return { label: `Compare in Google Trends: ${q.join(", ")}`, url: `https://trends.google.com/trends/explore?date=today%2012-m&q=${q.map(enc).join(",")}` };
}

/** Hashtags from the terms and the product's own name, as each platform writes them. */
export function hashtagsFor(terms: string[], productName: string): string[] {
  const tags = [...terms.map(toHashtag), toHashtag(productName)].filter((t) => t.length >= 3 && t.length <= 40);
  return [...new Set(tags)].slice(0, 8).map((t) => `#${t}`);
}
