/**
 * Public conversation sources that need no key and allow this use:
 * Hacker News (through its official Algolia search API) and Stack Overflow
 * (the Stack Exchange API, which asks for attribution: every item keeps its
 * author and link). Reddit and Bluesky are not used: Reddit's API terms need
 * approval for this, and Bluesky closed unauthenticated search.
 *
 * Only search terms derived from the founder's public site leave Banyan.
 * Parsers are pure and unit-tested; fetching is injected.
 */

import type { Conversation, LeadIntent, LeadSignal } from "./types";

export type JsonFetcher = (url: string) => Promise<unknown>;

const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Hacker News -------------------------------------------------------------

type HnHit = {
  objectID?: string;
  title?: string | null;
  url?: string | null;
  author?: string;
  points?: number | null;
  num_comments?: number | null;
  created_at?: string;
  comment_text?: string | null;
  story_id?: number | null;
  story_title?: string | null;
};

export function hnStoriesUrl(query: string, days = 365): string {
  const q = encodeURIComponent(query);
  return `https://hn.algolia.com/api/v1/search?query=${q}&tags=story&restrictSearchableAttributes=title&numericFilters=created_at_i>${now() - days * DAY}&hitsPerPage=12`;
}

/** Relevance-ranked (newest-first returns mostly comments that never name the topic). */
export function hnCommentsUrl(query: string, days = 730): string {
  const q = encodeURIComponent(query);
  return `https://hn.algolia.com/api/v1/search?query=${q}&tags=comment&numericFilters=created_at_i>${now() - days * DAY}&hitsPerPage=30`;
}

export function parseHnStories(body: unknown, query: string): Conversation[] {
  const hits = ((body as { hits?: HnHit[] })?.hits ?? []).filter((h) => h.objectID && h.title);
  return hits.map((h) => ({
    id: `hn:${h.objectID}`,
    source: "hacker_news" as const,
    title: decode(h.title ?? ""),
    // Link to the discussion, not the article: the conversation is the point.
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    author: h.author ?? "",
    points: h.points ?? 0,
    comments: h.num_comments ?? 0,
    createdAt: h.created_at ?? "",
    query,
  }));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Job posts, signatures and self-promotion mention tools without wanting one.
const NOT_A_LEAD = /\b(hiring|we'?re hiring|location:|remote:|onsite|salary|visa|résumé|resume|my email|email me|book a call|dm me|portfolio:)/i;

const SELF_PROMO = /\b(i'?m building|we'?re building|i'?ve built|i built|we built|i made|we made|launching|launched|kicked off|my (app|tool|product|startup|side project)|our (app|tool|product|startup))\b/i;

function sentencesOf(text: string): string[] {
  return text
    .replace(/https?:\/\/\S+/g, " ") // a tool named only inside a link is not a mention
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 400);
}

/** Patterns that tie an intent to a named competitor, in the same sentence. */
function competitorPatterns(name: string): [LeadIntent, RegExp][] {
  const n = esc(name);
  return [
    [
      "alternative_to",
      new RegExp(
        `\\balternatives? (to|for) ${n}\\b|\\b${n} alternatives?\\b|\\b(switch(ed|ing)?|mov(e|ed|ing)|migrat(e|ed|ing)) (away )?(from|off) ${n}\\b|\\breplac(e|ed|ing) ${n}\\b|\\b(ditch(ed|ing)?|cancel(l?ed)?|leaving|left|quit) ${n}\\b`,
        "i",
      ),
    ],
    [
      "frustrated",
      new RegExp(
        `\\b${n} (is|was|has (been|gotten)|got|feels|keeps) (\\w+ ){0,2}(too )?(expensive|overpriced|pricey|slow|buggy|clunky|annoying|bloated|terrible|awful|frustrating|limited|broken)\\b|\\b(hate|frustrated (with|by)|sick of|tired of|annoyed (with|by)|problems? with|issues? with|gave up on) ${n}\\b`,
        "i",
      ),
    ],
    ["comparing", new RegExp(`\\b(compared (to|with)|vs\\.?|versus|better than|cheaper than|instead of) ${n}\\b|\\b${n} (vs\\.?|versus) `, "i")],
  ];
}

const ASKING = /\b(looking for|recommend(ations?)? for|any (good )?(recommendations?|suggestions?)|is there (a|an|any)|anyone (know|use|recommend)|what do (you|people) use for|suggestions? for|need (a|an) (tool|app|service|way))\b/i;

/**
 * Comments where someone wants an alternative to a competitor, complains
 * about one, or asks for a tool for this problem. The intent and the topic
 * must sit in the same sentence; the excerpt is that sentence.
 */
export function parseHnLeads(body: unknown, topic: string, kind: "competitor" | "topic" = "competitor"): LeadSignal[] {
  const hits = (body as { hits?: HnHit[] })?.hits ?? [];
  const out: LeadSignal[] = [];
  const words = topic.split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()));
  const wordRes = (words.length ? words : [topic]).map((w) => new RegExp(`\\b${esc(w)}`, "i"));
  const patterns = kind === "competitor" ? competitorPatterns(topic) : [];
  for (const h of hits) {
    const text = decode(h.comment_text ?? "");
    if (!h.objectID || text.length < 40 || NOT_A_LEAD.test(text)) continue;
    let found: { intent: LeadIntent; sentence: string } | null = null;
    for (const s of sentencesOf(text)) {
      // "I'm building a Calendly alternative" is a competitor announcing itself, not a buyer.
      if (SELF_PROMO.test(s)) continue;
      if (kind === "competitor") {
        const hit = patterns.find(([, re]) => re.test(s));
        if (hit) found = { intent: hit[0], sentence: s };
      } else if (ASKING.test(s) && wordRes.every((re) => re.test(s))) {
        found = { intent: "looking_for_tool", sentence: s };
      }
      if (found) break;
    }
    if (!found) continue;
    out.push({
      id: `hn:${h.objectID}`,
      source: "hacker_news",
      author: h.author ?? "",
      excerpt: found.sentence.length > 260 ? `${found.sentence.slice(0, 259)}…` : found.sentence,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      createdAt: h.created_at ?? "",
      intent: found.intent,
      about: topic,
    });
  }
  return out;
}

// --- Stack Overflow ------------------------------------------------------------

type SeItem = {
  question_id?: number;
  title?: string;
  link?: string;
  owner?: { display_name?: string };
  score?: number;
  answer_count?: number;
  creation_date?: number;
  is_answered?: boolean;
};

export function soSearchUrl(query: string, days = 365): string {
  const q = encodeURIComponent(query);
  return `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${q}&site=stackoverflow&pagesize=8&fromdate=${now() - days * DAY}`;
}

/** Questions are people stuck on the problem right now: asking_how leads, and conversations. */
export function parseSoQuestions(body: unknown, query: string): { conversations: Conversation[]; leads: LeadSignal[] } {
  const items = ((body as { items?: SeItem[] })?.items ?? []).filter((i) => i.question_id && i.title && i.link);
  const conversations: Conversation[] = items.map((i) => ({
    id: `so:${i.question_id}`,
    source: "stack_overflow",
    title: decode(i.title ?? ""),
    url: i.link ?? "",
    author: decode(i.owner?.display_name ?? ""),
    points: i.score ?? 0,
    comments: i.answer_count ?? 0,
    createdAt: i.creation_date ? new Date(i.creation_date * 1000).toISOString() : "",
    query,
  }));
  const leads: LeadSignal[] = items
    .filter((i) => !i.is_answered)
    .map((i) => ({
      id: `so:${i.question_id}`,
      source: "stack_overflow" as const,
      author: decode(i.owner?.display_name ?? ""),
      excerpt: decode(i.title ?? ""),
      url: i.link ?? "",
      createdAt: i.creation_date ? new Date(i.creation_date * 1000).toISOString() : "",
      intent: "asking_how" as const,
      about: query,
    }));
  return { conversations, leads };
}

/** Relevance: how many of the query's meaningful words the title contains. */
export function titleRelevance(title: string, query: string): number {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (words.length === 0) return 0;
  const t = title.toLowerCase();
  return words.filter((w) => t.includes(w)).length / words.length;
}

const STOP = new Set(["the", "and", "for", "with", "your", "you", "app", "tool", "tools", "software", "platform", "best", "how", "that", "this", "from", "into", "where", "when", "what", "who", "people", "time", "one", "took", "finding", "make", "get", "new", "all", "more", "just", "now"]);
