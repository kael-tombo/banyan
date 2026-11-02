# 03 — No live model provider configured

## Problem

With no `OPENAI_API_KEY`, every strategy and draft comes from the labelled deterministic template. It is honest
and context-grounded, but it is not "in your voice" and the three formats read alike.

## Evidence

- `.env.example`: `OPENAI_API_KEY=""`; `src/lib/ai/provider.ts` is OpenAI-compatible only.
- `src/lib/ai/generate.ts` returns `provider: "template-fallback", isFallback: true` when no model answers.
- progress.md: "With no `OPENAI_API_KEY`, all three drafts are context-grounded but deterministic."
- STRATEGY.md Appendix D kill signals: "Founders say the formats feel duplicated"; approval rate below 25%.

## Why it blocks the promise

"Three channel-native assets" and "founder active time under 30 minutes" both depend on drafts good enough to
approve with light edits. Template drafts push founders into rewriting, which breaks the time budget and the
approval-rate assumption.

## Decision needed (founder)

Which provider and model funds the MVP. The router (`src/lib/model/router.ts`) is OpenAI-compatible, so any
compatible endpoint works today. Adding a native Anthropic client is a small change if Claude models are wanted
(e.g. `claude-sonnet-5-5` for drafts, `claude-haiku-5-5` for extraction).

## Plan, step by step

1. **Pick the provider and set a monthly spend cap** at the provider console; set `MODEL_MAX_CALLS_PER_DAY` to
   match (default 500 per workspace).
2. **(Optional) native Anthropic provider** in `src/lib/ai/provider.ts` behind the same interface, selected by
   env; prompt versions (US-045) stay unchanged.
3. **Build a small eval set** — 10 real product pages × 3 formats in `tests/evals/`. Score each draft on: uses
   the approved profile facts, respects channel limits, distinct hook per format, zero invented numbers. Run it
   before and after any prompt change.
4. **Tune prompts** in `src/lib/ai/prompts/` until ≥8/10 products produce drafts a reviewer would approve with
   small edits; bump the prompt version so `ModelCall` rows show which version produced what.
5. **Cost check** — record average credits and provider cost per cycle in the eval output; confirm the credit
   price (blocker 11) covers it.
6. **Keep the fallback** exactly as is: labelled, used only when the model fails or the quota is spent.

## Status (2026-11-02)

- **Eval built (step 3):** `npm run eval:drafts` (add `-- --judge` for a model's approvability score). Ten
  fictional products in `tests/evals/products.ts` × X thread, LinkedIn post and short-video script; automatic
  checks in `tests/evals/score.ts` (live model, channel limits, avoided terms, claims not in the evidence,
  grounded in the product's facts, no placeholders/meta-commentary, X and LinkedIn open differently). Each run
  writes every draft to `tests/evals/reports/<date>-<model>.md` for a human read.
- **Prompt tuned (step 4):** the first run on `glm-5.3-flash` (OpenCode Go, dev only) had 2/10 products fully
  clean: `[link]` placeholders in half the X threads, one invented price, one product whose X thread and LinkedIn
  post opened identically. Fixes in `generateContent`: no URLs or placeholders (Banyan attaches the tracked
  link), no numbers outside the facts, no stated facts about customers' behaviour, and a per-format guide that
  gives each format its own opening move. Result: **10/10 products clean, 0 invented claims, 10/10 distinct
  openings, judge 30/30 ≥ 4/5** (same-model judge, so a hint; the human read of the report agrees the drafts
  need light edits at most).
- **Cost (step 5):** reported list cost on `glm-5.3-flash` is about **$0.00055 per product for three drafts**
  (≈1,250 tokens in, 720 out) plus ≈$0.0002 for the plan, so well under $0.001 per cycle at list price. Re-run
  the eval on the production model once chosen and record its figure here.
- **Analysis and strategy checked too:** `npm run eval:onboarding` runs product analysis (from synthetic pages in
  `tests/evals/pages.ts`, one carrying a hidden instruction) and strategy exactly as the app does, retry and
  fallback included. On `glm-5.3-flash`: 10/10 analyses and 10/10 strategies used the model's output with no
  invalid responses, the hidden instruction was ignored, no invented numbers or KPI targets; about $0.0006 per
  product for both steps. No prompt change needed (`product-analysis.v1`, `strategy.v1` stay as shipped).
- **Still open:** the production provider and spend cap (step 1, founder decision). OpenCode Go's terms limit it
  to the founder's own use, so it cannot serve real founders.

## Acceptance

- In production, drafts show the live provider, not "Template fallback".
- Eval: ≥80% of drafts approvable with light edits; 0 invented metrics/testimonials; X thread and LinkedIn post
  differ in hook and structure on every sample.
- Cost per cycle is known and written in this file.

## Dependencies

Blocker 02 (secret on the server). Blocker 07 runs on the same outputs.

## Stories

US-044 (done) · US-045 (Review).
