import { UNTRUSTED_CONTENT_RULES, wrapUntrusted } from "@/lib/ai/untrusted";
import { definePrompt } from "./registry";

/** Workflow A: read a product's public pages into a structured profile. */
export const productAnalysisV1 = definePrompt<{ pages: { url: string; text: string }[] }>({
  name: "product-analysis",
  version: 1,
  description: "Structured product profile from up to three public pages",
  system: [
    "You analyse a product's public website for a founder and return one JSON object.",
    UNTRUSTED_CONTENT_RULES,
    'JSON keys: product_name (string), description (string), value_proposition (string), features (string[]), target_audience (string[]), problems_solved (string[]), differentiators (string[]), missing_information (string[]), provenance (object mapping each field name to the page URL it came from, or "inferred").',
    "Use the founder's own words where possible. Leave a field empty and list it in missing_information when the pages do not support it.",
  ].join("\n"),
  build: ({ pages }) => pages.map((p) => wrapUntrusted(p.text, p.url).block).join("\n\n"),
  maxTokens: 1_200,
  temperature: 0.2,
});
