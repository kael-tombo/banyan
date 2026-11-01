# 08 — No activation funnel

## Problem

Banyan measures its users' campaigns, but not itself. Nothing records when a founder submits a URL, approves a
strategy, approves the first asset or gets the first publication — so the MVP acceptance thresholds cannot be
checked.

## Evidence

- MVP_GAP_ANALYSIS.md "Business metrics": onboarding completion, time to first publication, publish success
  rate, campaign completion — **Not measured**.
- TD-13: "No funnel metric definitions". US-057, US-058 Backlog.

## Why it blocks the promise

The §11 thresholds — founder active time < 30 min, first approved asset < 24 h, ≥2 live publications, ≥1 tracked
outcome in 7 days — are claims about the product. Without timestamps they are unprovable, and the design-partner
gate ("8 of 10 complete a cycle") cannot be scored.

## Plan, step by step

1. **Define events** in `src/lib/activation.ts` (one place, typed): `signed_up`, `url_submitted`,
   `profile_approved`, `strategy_approved`, `first_asset_approved`, `first_publication` (with `path: provider |
   manual`), `first_tracked_visit`, `first_attributed_signup`, `cycle_report_final`.
2. **Record once per workspace** in an `ActivationEvent` table (unique on workspace + event); emit from the
   existing service functions, not from the UI, in the same transaction as the action.
3. **Active time** — approximate from authenticated request timestamps per session, gaps > 5 min excluded;
   store per workspace per cycle. Label it "approximate" everywhere.
4. **Operator report (US-058)** — an admin-only page or `npm run report:activation` script: funnel counts,
   median time between stages, primary activation (provider path) next to "first publication (any path)",
   publish success rate.
5. **Backfill** from existing rows (profiles, approvals, publications) for current workspaces, marked as backfilled.
6. **Tests** — idempotent recording, ordering, the provider vs. manual split.

## Acceptance

- For any workspace, the report shows each stage's timestamp and the gaps between them.
- The §11 thresholds can be read directly from the report for each design partner.
- No personal content (draft text, URLs) in the activation table.

## Dependencies

None to build. Data becomes meaningful after blocker 02.

## Stories

US-057, US-058.
