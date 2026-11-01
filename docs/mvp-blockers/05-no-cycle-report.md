# 05 — No cycle report

## Problem

The pieces exist — publications, tracked visits and signups, experiments, a recommendation — but nothing closes a
cycle with one report: what shipped, what it produced, what cannot be attributed, and the one variable to change
next.

## Status — 2026-11-01: built

`/app/cycles/[goalId]/report` (linked from the cycle cockpit as "Cycle report"), built on the pure
`src/lib/cycle-report.ts` with 11 tests. It covers what shipped, against the objective, what it produced, what
cannot be attributed, and change one thing next. Checked against the local database: the one existing cycle reports
"Not measured", with dashes rather than zeros, and lists its five limits.

Differences from the plan below:

- **No stored snapshot.** The report is computed live and labelled *Final* once the deadline passes, so it needed no
  migration. Freezing it as JSON can come later if late-arriving rows turn out to matter.
- **"Start the next cycle" links to the blank intake.** It does not pre-fill the proposed change yet.
- **Signups for a founder's own product are not tracked automatically.** Only Banyan's own signups arrive as
  first-party events; others must be recorded by hand on the campaign. The report says so whenever it applies.
  Closing that gap needs a signup pixel or webhook (new story).
- **Not opened in a browser yet.** The dev server was not running.

## Evidence

- STRATEGY.md §10 P0: "Results report with explicit limitations — **Partial**, measurement exists, no cycle
  report"; §11 output item 9.
- No `cycleReport` code in `src/`. `/app/cycles/[goalId]` shows outcomes and the next recommendation as separate
  panels; `/app/results` is workspace-wide, not per cycle.

## Why it blocks the promise

"Measured results, and the next move" is the end of the promise. Without a closing artefact the founder sees
panels, not a finished cycle, and the next-cycle proposal is not tied to this cycle's evidence.

## Plan, step by step

1. **Pure builder** `src/lib/cycle-report.ts`: input = goal, campaign, content items, publications, tracked
   links, events, recommendation. Output sections:
   - *Shipped* — each asset, channel, approved revision, live URL, provider-confirmed vs. manual.
   - *Produced* — visits and signups per link; provider metrics only if recorded; "unmeasured" otherwise.
   - *Not attributable* — signups without a tracked visit, channels without links, measurement window not over.
   - *Against the objective* — target vs. actual, with the window's days remaining.
   - *Change one thing* — the single variable from the recommendation, with its evidence items and confidence,
     or an explicit "not enough data".
2. **When it appears** — available as a draft any time; marked final when the window closes or the founder ends
   the cycle. Final reports are immutable snapshots stored as JSON on the goal.
3. **Page** — a "Report" tab on `/app/cycles/[goalId]`, printable; a share link can wait (P1).
4. **Next cycle** — a "Start next cycle with this change" button that pre-fills the next goal with the proposed
   variable and carries the report into learning memory.
5. **Tests** — unit tests for every section including the all-zero and no-links cases; never renders a number
   that has no row behind it.

## Acceptance

- Every number in the report links to its source rows.
- A cycle with zero visits says "0 measured visits", and a cycle without links says "not measured" — they are
  shown differently.
- The next-cycle proposal cites at least one evidence item or states that none exists.

## Dependencies

None to build. Meaningful numbers need blockers 01/02.

## Stories

US-059 (done, recommendation) · new story: "Cycle report" (add to USER_STORIES.md).
