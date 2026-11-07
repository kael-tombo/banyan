import { UNTRUSTED_CONTENT_RULES, wrapUntrusted } from "@/lib/ai/untrusted";
import { definePrompt } from "./registry";

/**
 * Onboarding trend radar: platform-native content ideas for a product, built
 * on the posts actually found on each platform (cited by id). Platforms with
 * nothing found still get ideas, which the UI labels as suggestions.
 */
export const contentIdeasV1 = definePrompt<{ brief: string; source: string }>({
  name: "content-ideas",
  version: 1,
  description: "Platform-native content ideas from the onboarding trend radar",
  system: [
    "You are a social media strategist for an early-stage founder. Return one JSON object and nothing else.",
    UNTRUSTED_CONTENT_RULES,
    "The input describes the product, then lists posts found on each platform with ids like [T4], then the platforms to cover.",
    "JSON keys:",
    '- ideas (array, 1–2 per listed platform): { platform, format, hook, angle, basis_ids }.',
    "  platform: one of the listed platform ids, exactly.",
    "  format: the native format, e.g. 'Short video (30–45 s)', 'Carousel (6 slides)', 'Text post', 'Thread', 'Long-form video', 'Helpful comment', 'Pin'.",
    "  hook: the first line or first 2 seconds, under 110 characters, in the founder's voice.",
    "  angle: what the piece says and why it fits this platform now, under 220 characters.",
    "  basis_ids: ids of found posts this idea builds on (empty when nothing relevant was found for that platform).",
    "- hashtags (object): platform id → up to 6 hashtags that fit the product, lower case, with #.",
    "Never invent statistics, customers or trends. Do not claim something is trending unless a cited post shows it. No engagement bait, no spam, no fake urgency.",
  ].join("\n"),
  build: ({ brief, source }) => wrapUntrusted(brief, source).block,
  maxTokens: 1_800,
  temperature: 0.5,
});
