import { CHANNELS, type Channel } from "@/lib/formats";

/**
 * Human-selected channels travel with a goal as a constraint:
 *   "channels: linkedin, x, shortvideo"
 *
 * The strategy handler reads this so a cycle cannot silently drop a channel
 * the founder chose. The parser is pure and tolerant of the forms people
 * actually type ("Channels = LinkedIn; X", "twitter", "short-form video").
 */

const ALIASES: Record<string, Channel> = {
  x: "x",
  twitter: "x",
  linkedin: "linkedin",
  li: "linkedin",
  shortvideo: "shortvideo",
  video: "shortvideo",
  shorts: "shortvideo",
  shortform: "shortvideo",
  shortformvideo: "shortvideo",
  tiktok: "shortvideo",
  reels: "shortvideo",
  reel: "shortvideo",
};

export function normalizeChannelToken(raw: string): Channel | null {
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return ALIASES[key] ?? null;
}

export function parseChannelConstraint(constraints: string): Channel[] {
  // Read to the end of the line, not the first semicolon: people type
  // "Channels = LinkedIn; X". Walk tokens in order and stop at the first
  // non-channel word, so a later constraint ("no paid ads") never becomes a
  // channel by accident.
  const match = constraints.match(/(?:^|[;\n])\s*channels?\s*[:=]\s*([^\n]+)/i);
  if (!match) return [];
  const found: Channel[] = [];
  for (const token of match[1].split(/[,\s;]+/)) {
    if (!token) continue;
    if (/^(and|&|\+)$/i.test(token)) continue;
    const channel = normalizeChannelToken(token);
    if (!channel) break;
    if (!found.includes(channel)) found.push(channel);
  }
  return found.filter((channel) => (CHANNELS as readonly string[]).includes(channel));
}

/** Render the canonical constraint string stored on a goal. */
export function channelConstraint(channels: Channel[]): string {
  return channels.length > 0 ? `channels: ${channels.join(", ")}` : "";
}
