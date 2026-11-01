# 07 — No fabricated-claims or brand guard

## Problem

Prompts ask the model not to invent numbers, customers or testimonials, but nothing checks the output. A live
model (blocker 03) will occasionally write "trusted by 500 teams" or "cut costs by 40%" — and the founder may
approve it without noticing.

## Evidence

- US-054 "Guard against fabricated claims and brand violations" — Backlog.
- The template fallback is safe by construction (`generate.ts`: "never invents claims"), but live model output
  is unchecked.
- Brand restrictions (US-026) are not captured yet, so there is nothing to check against.

## Why it blocks the promise

§11 acceptance: **"Fabricated data: zero."** Appendix D kill signal: "Any shipped fabricated metric." Once posts
go live under the founder's name (blocker 01), a fabricated claim is a public, reputational failure.

## Plan, step by step

1. **Deterministic detector** `src/lib/content/claims.ts` (pure, unit-tested): flag numbers with units/percent,
   customer counts, "trusted by", named companies/logos, testimonials/quotes, superlatives ("#1", "best"),
   guarantees ("guaranteed", "10x").
2. **Grounding check** — each flagged claim passes only if it matches a fact in the approved product profile or
   a `ProfileFact` with provenance. Otherwise it is *unsupported*.
3. **Brand rules** (minimal US-026): forbidden words/claims and required disclosures on the workspace; checked
   the same way.
4. **Where it runs** — after every generation and every human edit. Unsupported claims are highlighted in the
   draft editor with "Remove", "Add as a fact" (creates a user-provided fact) or "Keep — I can back this up".
5. **Gate** — approval is allowed only when every flag is resolved; the resolution is stored on the approved
   revision so the audit shows who vouched for what.
6. **Feedback to the model** — on regeneration, unsupported claims from the previous version are passed as
   "do not state".
7. **Eval** — add adversarial cases to blocker 03's eval set; target 0 unresolved fabricated claims reaching
   approval.

## Acceptance

- A draft containing "used by 1,000 founders" without a matching fact cannot be approved until resolved.
- A claim that matches a profile fact passes with no friction.
- Every approved revision records its claim resolutions.

## Dependencies

Blocker 03 (real outputs to test against). Pairs with US-026 for brand rules.

## Stories

US-054, US-026 (subset).
