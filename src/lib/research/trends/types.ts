/**
 * The trend radar: what is getting attention around a product, platform by
 * platform. Two kinds of platform:
 *
 *   - "live": an official API Banyan may call (YouTube, Reddit, Bluesky with
 *     credentials; Hacker News, DEV and Wikipedia without). Items are real
 *     posts with their link, author, date and engagement.
 *   - "research": no public search API (TikTok, Instagram, Facebook,
 *     LinkedIn, X, Pinterest, Google Trends). Banyan does not scrape them; it
 *     gives one-click searches on the platform itself, competitors' public ad
 *     libraries, and suggested hashtags and ideas, labelled as suggestions.
 */

export type PlatformId =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "reddit"
  | "linkedin"
  | "x"
  | "bluesky"
  | "pinterest"
  | "hacker_news"
  | "dev";

export type PlatformStatus =
  /** Read live; `items` holds what was found. */
  | "live"
  /** Has an official API, but its credentials are not set here. */
  | "needs_key"
  /** No public search API; research links only. */
  | "no_api"
  /** The API was called and failed (quota, outage). */
  | "failed";

export type TrendItem = {
  id: string;
  platform: PlatformId;
  title: string;
  url: string;
  author: string;
  publishedAt: string;
  /** Engagement as the platform reports it; absent when it reports none. */
  views?: number;
  likes?: number;
  comments?: number;
  score?: number;
  thumbnail?: string;
  /** The search term or competitor that found it. */
  query: string;
};

export type ResearchLink = { label: string; url: string; hint?: string };

export type ContentIdea = {
  id: string;
  platform: PlatformId;
  /** e.g. "Short video", "Carousel", "Thread", "Long-form video". */
  format: string;
  hook: string;
  angle: string;
  /** What it rests on: a found item, or "suggestion" when nothing was found. */
  basis: { label: string; url?: string }[];
  source: "model" | "rule";
};

export type PlatformReport = {
  platform: PlatformId;
  status: PlatformStatus;
  /** Why a platform is not live, or what failed, in one plain sentence. */
  note: string;
  items: TrendItem[];
  links: ResearchLink[];
  hashtags: string[];
};

/** Monthly Wikipedia page views: a real, public measure of interest in a topic or competitor. */
export type InterestSeries = {
  label: string;
  article: string;
  url: string;
  months: { month: string; views: number }[];
  /** Change of the last 3 months against the 3 before, in percent; null without enough data. */
  change: number | null;
};

export type TrendsReport = {
  method: "model" | "basic";
  terms: string[];
  platforms: PlatformReport[];
  interest: InterestSeries[];
  ideas: ContentIdea[];
  generatedAt: string;
};

export const PLATFORM_LABEL: Record<PlatformId, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  x: "X",
  bluesky: "Bluesky",
  pinterest: "Pinterest",
  hacker_news: "Hacker News",
  dev: "DEV",
};
