import { CHANNEL_LIMITS, type Channel } from "@/lib/formats";

/**
 * Draft formatting and pre-review checks — US-044. Pure and unit-tested.
 *
 * Formatting fixes what can be fixed without changing meaning (an X thread
 * post over 280 characters is split at sentence boundaries). Everything
 * else is flagged for the founder rather than silently rewritten: a draft
 * that is too long, or that contains a term the brand voice bans.
 */

export const X_POST_LIMIT = 280;

export type DraftFlag =
  | { code: "banned_term"; term: string; message: string }
  | { code: "over_limit"; limit: number; length: number; message: string };

/** Terms from the brand voice "avoid" field: comma, semicolon or line separated. */
export function bannedTerms(avoid: string | null | undefined): string[] {
  return [...new Set((avoid ?? "").split(/[,;\n]+/).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2 && t.length <= 60))];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive matches of banned terms. */
export function findBannedTerms(body: string, terms: string[]): string[] {
  return terms.filter((t) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(t)}($|[^\\p{L}\\p{N}])`, "iu").test(body));
}

/** Split text into chunks of at most `limit`, preferring sentence then word boundaries. */
export function chunkText(text: string, limit: number): string[] {
  const out: string[] = [];
  let current = "";
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  const push = () => { if (current.trim()) out.push(current.trim()); current = ""; };
  for (const sentence of sentences) {
    if (sentence.length > limit) {
      push();
      let rest = sentence;
      while (rest.length > limit) {
        const cut = rest.slice(0, limit + 1).lastIndexOf(" ");
        const at = cut > limit * 0.5 ? cut : limit;
        out.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      current = rest;
      continue;
    }
    if ((current ? `${current} ${sentence}` : sentence).length > limit) push();
    current = current ? `${current} ${sentence}` : sentence;
  }
  push();
  return out;
}

/**
 * Normalise an X thread: one post per paragraph, numbered "1/", "2/", ...
 * with every post (number included) within 280 characters.
 */
export function formatThread(body: string): string {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\s*\d+\s*[/.)]\s*/, "").trim())
    .filter(Boolean);
  // Reserve room for the "NN/ " prefix.
  const posts = paragraphs.flatMap((p) => chunkText(p, X_POST_LIMIT - 5));
  return posts.map((p, i) => `${i + 1}/ ${p}`).join("\n\n");
}

export function formatDraft(channel: Channel, format: string, body: string): string {
  if (channel === "x" && format === "thread") return formatThread(body);
  return body.trim();
}

export function checkDraft(input: { channel: Channel; format: string; body: string; banned: string[] }): DraftFlag[] {
  const flags: DraftFlag[] = [];
  for (const term of findBannedTerms(input.body, input.banned)) {
    flags.push({ code: "banned_term", term, message: `Contains "${term}", which your brand voice says to avoid.` });
  }
  const limit = input.channel === "x" && input.format !== "thread" ? X_POST_LIMIT : CHANNEL_LIMITS[input.channel];
  if (input.channel === "x" && input.format === "thread") {
    const long = input.body.split(/\n\s*\n/).find((p) => p.trim().length > X_POST_LIMIT);
    if (long) flags.push({ code: "over_limit", limit: X_POST_LIMIT, length: long.trim().length, message: `A thread post is ${long.trim().length} characters; X allows ${X_POST_LIMIT}.` });
  } else if (input.body.length > limit) {
    flags.push({ code: "over_limit", limit, length: input.body.length, message: `${input.body.length} characters; the limit here is ${limit}.` });
  }
  return flags;
}

export function parseFlags(raw: string | null | undefined): DraftFlag[] {
  try {
    const v: unknown = JSON.parse(raw || "[]");
    return Array.isArray(v) ? (v as DraftFlag[]).filter((f) => f && typeof f === "object" && "code" in f && "message" in f) : [];
  } catch {
    return [];
  }
}
