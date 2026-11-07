import { UNTRUSTED_CONTENT_RULES, wrapUntrusted } from "@/lib/ai/untrusted";
import { definePrompt } from "./registry";

/**
 * Workflow A, v2: a full positioning read of a product's public site.
 *
 * Adds to v1: tagline, category, stage, positioning, audience pain and
 * outcome, pricing, proof, the main call to action, tone and alternatives,
 * and it receives the parsed site signals (meta tags, structured data, hero,
 * calls to action) next to the page text, because much of a modern site's
 * positioning lives in its head and its buttons rather than its paragraphs.
 */
export const productAnalysisV2 = definePrompt<{ pages: { url: string; text: string }[]; signals: string; signalsSource: string }>({
  name: "product-analysis",
  version: 2,
  description: "Full positioning profile from up to five public pages and their parsed signals",
  system: [
    "You analyse a product's public website for its founder, so they do not have to type what their own site already says. Return one JSON object and nothing else.",
    UNTRUSTED_CONTENT_RULES,
    "JSON keys:",
    "- product_name (string)",
    "- tagline (string: the site's own one-line promise, usually the hero headline)",
    "- description (string: 1–3 plain sentences on what the product does)",
    "- value_proposition (string: the concrete outcome for the customer, under 300 characters)",
    "- category (string: e.g. 'invoicing software for freelancers'; short)",
    '- stage (one of "idea", "building", "private_beta", "public_beta", "launched", "growth", or "" when unclear; waitlist/coming soon = building, invite-only = private_beta, beta label = public_beta, named customers or large user counts = growth, otherwise a live product with pricing or sign-up = launched)',
    "- target_audience (string[], at most 6: specific segments, most important first)",
    "- audience_pain (string: what is painful for them today, in their words)",
    "- audience_outcome (string: what they get once it works)",
    "- problems_solved (string[], at most 6)",
    "- features (string[], at most 12: the most important capabilities the site names, short)",
    "- differentiators (string[], at most 6: what the site says makes it different or better)",
    "- positioning (string: one sentence, 'For <audience> who <need>, <product> is a <category> that <benefit>. Unlike <alternative>, it <difference>.' Leave out the 'Unlike' part when the site names no alternative)",
    "- pricing (string: plans and prices exactly as stated, or '' when the site states none)",
    "- proof (string[], at most 8, strongest first: customer names, counts, ratings, awards or testimonial quotes exactly as stated; never round or improve a number)",
    "- primary_cta (string: the main action the site asks for, e.g. 'Start free trial')",
    "- tone (string: 3–5 words describing how the site writes, e.g. 'warm, direct, lightly playful')",
    "- alternatives (string[], at most 6: competitors or the status quo the site compares itself to)",
    "- missing_information (string[], at most 12: what a marketer would need that the pages do not say)",
    '- provenance (object: field name → the page URL it came from, or "inferred")',
    "Rules: use the site's own words where possible. Everything must be supported by the pages or the signals; when something is not, leave the field empty and list it in missing_information. You may infer positioning, stage and tone from what is stated, and mark them \"inferred\" in provenance. Never invent customers, numbers, prices or competitors.",
  ].join("\n"),
  build: ({ pages, signals, signalsSource }) =>
    [
      signals ? wrapUntrusted(`Parsed signals from the site (meta tags, structured data, hero, buttons):\n${signals}`, signalsSource).block : "",
      ...pages.map((p) => wrapUntrusted(p.text, p.url).block),
    ]
      .filter(Boolean)
      .join("\n\n"),
  maxTokens: 2_000,
  temperature: 0.2,
});
