import type { Platform } from "./platforms";

/**
 * The content that flows through the distribution landscape.
 *
 * Deterministic and bounded: each column renders one short sequence twice,
 * so the DOM stays small however long the page is watched. Every author,
 * product and number here is fictional and illustrative — this is a picture
 * of the internet Banyan distributes into, not a report of Banyan's results.
 */

/** A thumbnail drawn in CSS + SVG: a tone and a motif, no image files. */
export type Thumb = {
  tone: "dawn" | "sea" | "moss" | "ink" | "sand" | "lilac" | "sky" | "clay";
  motif: "chart" | "terminal" | "ui" | "orbit" | "type" | "hills" | "grid" | "device";
  label?: string;
};

export type Card =
  | {
      kind: "post";
      platform: "x" | "linkedin" | "threads" | "facebook";
      author: string;
      handle: string;
      time: string;
      body: string;
      tags?: string[];
      media?: Thumb;
      stats: { replies?: string; reposts?: string; likes: string };
    }
  | {
      kind: "video";
      platform: "youtube";
      title: string;
      channel: string;
      views: string;
      age: string;
      duration: string;
      thumb: Thumb;
    }
  | {
      kind: "short";
      platform: "tiktok" | "instagram" | "youtube";
      format: "TikTok" | "Reel" | "Short";
      caption: string;
      author: string;
      likes: string;
      duration: string;
      thumb: Thumb;
    }
  | {
      kind: "article";
      platform: "medium" | "substack" | "blog";
      publication: string;
      title: string;
      excerpt: string;
      author: string;
      meta: string;
      thumb?: Thumb;
    }
  | {
      kind: "thread";
      platform: "reddit" | "quora" | "discord";
      community: string;
      title: string;
      excerpt?: string;
      flair?: string;
      votes: string;
      comments: string;
      time: string;
    }
  | {
      kind: "email";
      platform: "gmail";
      from: string;
      subject: string;
      preview: string;
      time: string;
      label?: string;
    }
  | {
      kind: "launch";
      platform: "producthunt" | "github";
      name: string;
      tagline: string;
      metric: string;
      metricLabel: string;
      meta: string;
      tone: Thumb["tone"];
    }
  | {
      kind: "board";
      platform: "pinterest" | "instagram";
      title: string;
      author: string;
      saves: string;
      tiles: Thumb[];
    };

export type Column = {
  /** Bottom → top ("up") or top → bottom ("down"). */
  direction: "up" | "down";
  /** Seconds for one full sequence to pass. Lower is faster. */
  duration: number;
  /** Negative start offset in seconds, so columns never move in step. */
  delay: number;
  cards: Card[];
};

const col1: Card[] = [
  {
    kind: "post", platform: "x", author: "Maya Okafor", handle: "@mayabuilds", time: "2h",
    body: "Shipped offline mode for Ledgerline today. 41 days, 3 rewrites, one very patient beta group. Changelog below.",
    tags: ["#buildinpublic"],
    stats: { replies: "38", reposts: "112", likes: "1.4K" },
  },
  {
    kind: "article", platform: "medium", publication: "Better Programming",
    title: "We replaced our queue with Postgres and slept better",
    excerpt: "SKIP LOCKED, advisory locks and one table took us from three services to one.",
    author: "Tomás Vidal", meta: "9 min read",
    thumb: { tone: "ink", motif: "terminal" },
  },
  {
    kind: "post", platform: "threads", author: "Hana Sato", handle: "hana.makes", time: "5h",
    body: "Pricing page test: removing the free tier comparison raised trial starts. Not what I expected at all.",
    stats: { replies: "64", likes: "902" },
  },
  {
    kind: "article", platform: "substack", publication: "The Indie Ledger",
    title: "Issue 87: The first 100 customers came from 4 places",
    excerpt: "A teardown of twelve bootstrapped launches, and the channel each one leaned on.",
    author: "Priya Raman", meta: "Newsletter · 6 min",
  },
  {
    kind: "post", platform: "facebook", author: "Driftwood CMS", handle: "Page", time: "Yesterday",
    body: "Version 4 is live. Visual editing for every block, and your old templates still work.",
    media: { tone: "sky", motif: "ui", label: "Driftwood 4" },
    stats: { replies: "27", reposts: "41", likes: "386" },
  },
  {
    kind: "article", platform: "blog", publication: "parcel.dev/blog",
    title: "How we cut cold starts from 2.1s to 340ms",
    excerpt: "A step-by-step tutorial with the flame graphs we used along the way.",
    author: "Ellis Park", meta: "Tutorial · 12 min",
    thumb: { tone: "moss", motif: "chart" },
  },
  {
    kind: "post", platform: "x", author: "Jonah Reyes", handle: "@jreyes", time: "1d",
    body: "Hot take: your launch post is not your distribution strategy. It is one day of it.",
    stats: { replies: "211", reposts: "530", likes: "4.8K" },
  },
];

const col2: Card[] = [
  {
    kind: "video", platform: "youtube", title: "I built a SaaS in 30 days. Here's the revenue",
    channel: "Founder Mode", views: "182K views", age: "3 days ago", duration: "18:42",
    thumb: { tone: "dawn", motif: "chart", label: "$0 → $4.2K" },
  },
  {
    kind: "short", platform: "tiktok", format: "TikTok",
    caption: "POV: your side project gets its first paying user at 2am", author: "@codewithnoor",
    likes: "92K", duration: "0:24", thumb: { tone: "lilac", motif: "device" },
  },
  {
    kind: "video", platform: "youtube", title: "Fine-tuning a small model for support tickets",
    channel: "Applied AI Lab", views: "64K views", age: "1 week ago", duration: "26:05",
    thumb: { tone: "ink", motif: "terminal", label: "eval: 91.4%" },
  },
  {
    kind: "short", platform: "instagram", format: "Reel",
    caption: "3 onboarding screens we deleted, and why activation went up", author: "@tinyform",
    likes: "18K", duration: "0:41", thumb: { tone: "sand", motif: "ui" },
  },
  {
    kind: "video", platform: "youtube", title: "Open source maintainers on burnout and funding",
    channel: "Changelog Live", views: "41K views", age: "2 weeks ago", duration: "52:17",
    thumb: { tone: "moss", motif: "orbit" },
  },
  {
    kind: "short", platform: "youtube", format: "Short",
    caption: "The 10-second demo that sold our API", author: "@quillstack",
    likes: "7.3K", duration: "0:15", thumb: { tone: "sea", motif: "type", label: "curl it" },
  },
];

const col3: Card[] = [
  {
    kind: "post", platform: "linkedin", author: "Aisha Mensah", handle: "Head of Growth, Orbit Notes", time: "4h",
    body: "We stopped posting every day and started posting one useful teardown a week. Inbound demos doubled in a quarter.",
    media: { tone: "sea", motif: "chart", label: "Demos per week" },
    stats: { replies: "96", reposts: "58", likes: "2.1K" },
  },
  {
    kind: "launch", platform: "producthunt", name: "Fernwatch",
    tagline: "Uptime monitoring that explains the outage in plain words",
    metric: "#2", metricLabel: "Product of the day", meta: "634 upvotes · Developer tools", tone: "moss",
  },
  {
    kind: "post", platform: "x", author: "Ravi Menon", handle: "@ravimakes", time: "6h",
    body: "Thread: everything we learned taking an open-source CLI to 10K GitHub stars. No paid ads, one blog post did most of it. 1/9",
    stats: { replies: "77", reposts: "640", likes: "3.9K" },
  },
  {
    kind: "email", platform: "gmail", from: "Parcel AI", subject: "You're in: early access starts Monday",
    preview: "Thanks for joining the waitlist. Here's your invite link and a 5-minute setup guide.", time: "9:41", label: "Launch",
  },
  {
    kind: "post", platform: "linkedin", author: "Sofia Lindqvist", handle: "Founder, Tinyform", time: "1d",
    body: "Year one, in numbers: 3 pivots, 1 co-founder, 840 customers. The thing that worked was answering every support email myself.",
    stats: { replies: "143", reposts: "77", likes: "5.6K" },
  },
  {
    kind: "launch", platform: "github", name: "quillstack/quill",
    tagline: "v2.0.0 · Streaming responses, typed plugins, 40% smaller bundle",
    metric: "12.4K", metricLabel: "stars", meta: "Released 3 days ago · MIT", tone: "ink",
  },
];

const col4: Card[] = [
  {
    kind: "thread", platform: "reddit", community: "r/SaaS", flair: "Lessons",
    title: "We hit $10K MRR. Here is every channel we tried, ranked by signups",
    excerpt: "Spoiler: cold outreach was last. Niche communities and one comparison page were first.",
    votes: "2.3K", comments: "418", time: "8h",
  },
  {
    kind: "board", platform: "instagram", title: "Behind the build: week 12", author: "@orbitnotes",
    saves: "4.1K likes",
    tiles: [{ tone: "sand", motif: "ui" }, { tone: "moss", motif: "hills" }, { tone: "dawn", motif: "type", label: "v1.2" }],
  },
  {
    kind: "thread", platform: "quora", community: "Startups",
    title: "What's the best way to market a developer tool with no budget?",
    excerpt: "Answered by a DevRel lead who grew two open-source tools past 50K users.",
    votes: "1.1K upvotes", comments: "86 answers", time: "2d",
  },
  {
    kind: "board", platform: "pinterest", title: "SaaS landing page ideas", author: "Noor Haddad",
    saves: "12K saves",
    tiles: [{ tone: "sky", motif: "ui" }, { tone: "lilac", motif: "grid" }, { tone: "clay", motif: "type", label: "Aa" }, { tone: "sea", motif: "chart" }],
  },
  {
    kind: "thread", platform: "discord", community: "#announcements · Ledgerline",
    title: "Offline mode is rolling out to everyone this week",
    excerpt: "Tell us what breaks in #feedback, we're shipping fixes daily.",
    votes: "312 reactions", comments: "54 replies", time: "Today",
  },
  {
    kind: "thread", platform: "reddit", community: "r/selfhosted",
    title: "Show: a tiny analytics server that fits on a Raspberry Pi",
    votes: "864", comments: "129", time: "1d",
  },
];

/** Column timing: two flow up, two flow down, none in step. */
export const HERO_COLUMNS: Column[] = [
  { direction: "up", duration: 84, delay: -11, cards: col1 },
  { direction: "down", duration: 66, delay: -37, cards: col2 },
  { direction: "up", duration: 76, delay: -52, cards: col3 },
  { direction: "down", duration: 96, delay: -23, cards: col4 },
];

/** The closing landscape: the same streams, regrouped and denser. */
export const CLOSING_COLUMNS: Column[] = [
  { direction: "up", duration: 78, delay: -40, cards: [col3[1], col1[0], col4[0], col2[1], col1[3], col3[3]] },
  { direction: "down", duration: 62, delay: -8, cards: [col2[0], col3[0], col1[5], col4[1], col2[5]] },
  { direction: "up", duration: 72, delay: -29, cards: [col4[2], col2[2], col1[2], col3[5], col4[4], col1[6]] },
  { direction: "down", duration: 90, delay: -61, cards: [col1[1], col4[3], col3[2], col2[3], col3[4]] },
];

/** Every channel on the rails, split between the two sides. */
export const RAIL_LEFT: Platform[] = ["facebook", "instagram", "youtube", "tiktok", "x", "linkedin", "reddit", "threads", "pinterest"];
export const RAIL_RIGHT: Platform[] = ["medium", "quora", "discord", "telegram", "whatsapp", "gmail", "producthunt", "github"];
