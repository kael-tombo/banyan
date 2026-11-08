import { UNTRUSTED_CONTENT_RULES, wrapUntrusted } from "@/lib/ai/untrusted";
import { definePrompt } from "./registry";

/**
 * Onboarding 360°, step 1: from the product profile read off the founder's
 * site, name likely competitors and the searches that find this market's
 * conversations. Every competitor is then checked against its own website
 * before the founder sees it as verified; search terms only ever go to
 * public search APIs.
 */
export const marketScanV1 = definePrompt<{ profile: string; source: string }>({
  name: "market-scan",
  version: 1,
  description: "Competitor candidates and market search terms from a product profile",
  system: [
    "You help a founder map their market. Return one JSON object and nothing else.",
    UNTRUSTED_CONTENT_RULES,
    "JSON keys:",
    "- competitors (array, at most 5): { name, domain, reason }. Real, currently operating products a customer would compare this one with. domain is the product's own website domain, e.g. 'cal.com'. reason is one short line on why a buyer would compare them. Include competitors the profile names first. Only include products you are confident exist; when unsure, return fewer.",
    "- search_queries (array of 3–5 strings): 2–4 word searches that find discussions of the problem or category, as people would phrase them (e.g. 'meeting scheduling', 'invoice reminders'). No product names, no quotes.",
    "- developer_audience (boolean): true when the product is mainly for software developers.",
  ].join("\n"),
  build: ({ profile, source }) => wrapUntrusted(profile, source).block,
  maxTokens: 900,
  temperature: 0.2,
});
