import { z } from "zod";

export const CHANNELS = ["x", "linkedin", "shortvideo"] as const;
export type Channel = (typeof CHANNELS)[number];

export type ChannelMeta = {
  key: Channel;
  label: string;
  description: string;
  // Runtime connection status text; capability vs. integration configuration.
  capability: string;
  requiresIntegration: boolean;
};

export const CHANNEL_META: Record<Channel, ChannelMeta> = {
  x: {
    key: "x",
    label: "X",
    description: "Single posts, threads, discussion starters, and product updates.",
    capability: "Content generation and review are available. Publishing runs in export mode until SocialFlow.ai is available.",
    requiresIntegration: true,
  },
  linkedin: {
    key: "linkedin",
    label: "LinkedIn",
    description: "Professional insights, founder stories, product-building updates, problem/solution, and announcements.",
    capability: "Content generation and review are available. Publishing runs in export mode until SocialFlow.ai is available.",
    requiresIntegration: true,
  },
  shortvideo: {
    key: "shortvideo",
    label: "Short-form video",
    description: "Hooks, scripts, scene outlines, visual notes, on-screen text, captions, and CTAs. Video production itself is manual.",
    capability: "Scripting and planning only. Publishing video is manual (record and attach externally).",
    requiresIntegration: false,
  },
};

export const CHANNEL_FORMATS: Record<Channel, { key: string; label: string }[]> = {
  x: [
    { key: "single", label: "Single post" },
    { key: "thread", label: "Thread" },
    { key: "discussion", label: "Discussion starter" },
    { key: "update", label: "Product update" },
  ],
  linkedin: [
    { key: "insight", label: "Professional insight" },
    { key: "founder_story", label: "Founder story" },
    { key: "build_update", label: "Product-building update" },
    { key: "problem_solution", label: "Problem/solution post" },
    { key: "announcement", label: "Product announcement" },
  ],
  shortvideo: [
    { key: "hook_script", label: "Hook + script" },
    { key: "storyboard", label: "Scene-by-scene" },
  ],
};

export const CHANNEL_LIMITS: Record<Channel, number> = {
  x: 10_000, // single post up to 280 chars; threads carried in structured text
  linkedin: 3_000,
  shortvideo: 6_000,
};

export function isChannel(v: string): v is Channel {
  return (CHANNELS as readonly string[]).includes(v);
}

/**
 * Short-form video is scripted and prepared, but publishing it is a manual
 * handoff: there is no provider integration, so it must never be counted as a
 * live publish attempt.
 */
export function isManualChannel(channel: string): boolean {
  return channel === "shortvideo";
}

export function formatsFor(channel: string) {
  return isChannel(channel) ? CHANNEL_FORMATS[channel] : [];
}

export function isFormatFor(channel: string, format: string): boolean {
  return formatsFor(channel).some((f) => f.key === format);
}

// --- Zod schemas ---

export const channelSchema = z.enum(CHANNELS);

export function contentBodySchema(channel: Channel) {
  return z
    .string()
    .trim()
    .min(5)
    .max(CHANNEL_LIMITS[channel], `Body exceeds the ${CHANNEL_LIMITS[channel]} character limit for ${channel}`);
}

/**
 * A post's name as a founder reads it. Generated drafts are titled like
 * "Get 20 signups in 14 days — wave 1 — linkedin insight"; those become
 * "LinkedIn · Professional insight". A title the founder wrote is kept.
 */
export function postLabel(item: { title: string; channel: string; format: string }): { name: string; generated: boolean } {
  const channel = isChannel(item.channel) ? CHANNEL_META[item.channel].label : item.channel;
  const format = isChannel(item.channel) ? CHANNEL_FORMATS[item.channel].find((f) => f.key === item.format)?.label : undefined;
  const pretty = format ? `${channel} · ${format}` : channel;
  const generated = /\s—\s(wave|cycle)\s\d+\s—\s/i.test(item.title) || item.title.trim() === "" || item.title.toLowerCase().endsWith(`${item.channel} ${item.format}`.toLowerCase());
  return { name: generated ? pretty : item.title, generated };
}

/** The first line of a post, for previews (no markdown, one line, capped). */
export function firstLine(body: string, max = 140): string {
  const line = body.split(/\n+/).map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : line;
}

/** "Get 20 signups in 14 days — wave 1" → "Get 20 signups in 14 days": the cycle as the founder named it. */
export function cycleName(campaignName: string): string {
  return campaignName.replace(/\s+[—–-]\s+(wave|cycle)\s+\d+\s*$/i, "").trim();
}
