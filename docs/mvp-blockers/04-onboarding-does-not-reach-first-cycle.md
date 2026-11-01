# 04 — Onboarding stops before the first campaign and publication

## Problem

A new founder can sign up, submit a URL and approve a profile, but onboarding does not carry them into their
first strategy, campaign, approvals and publication. They land in a large app and must find the cycle themselves.

## Evidence

- `docs/user-stories.json` critical path: **US-039 → US-040 → US-041 → US-074 → US-075**; US-039/040/041 are
  Backlog. US-019 In Progress, US-020/026/038 Backlog.
- `src/lib/onboarding/stages.ts` defines nine stages; the last stages (preferences, first campaign, activation)
  have no implementation.
- The full cycle today is reached through `/app/cycles/new`, a separate entry point.

## Why it blocks the promise

The promise is one bounded cycle with under 30 minutes of founder time. If the cycle is not the guided path, most
founders will not finish it, and the "time to first approved asset < 24 h" criterion is left to luck.

## Plan, step by step

1. **Merge the two entry points**: onboarding *is* the first cycle. Reuse `/app/cycles/new` logic rather than
   building a second intake.
2. **US-019 / US-020** — finish workspace basics (name, time zone) and the one-paragraph "what you are building
   and for whom"; keep each to one screen, pre-filled from the approved profile.
3. **US-038 / US-039** — "How should Banyan publish?": connect LinkedIn / X (blocker 01) or choose export mode;
   cadence and objective as one question each ("20 signups in 14 days" style, with defaults).
4. **US-040** — generate the strategy inside onboarding, show the credit estimate (already on the strategy), and
   let the founder approve, edit or reject without leaving the flow.
5. **US-041** — show the three drafts in sequence, approve each, then publish (or export + record URL). End on a
   "your cycle is live" screen that links to the cycle cockpit and states when the first results are expected.
6. **Resume and skip** — progress is already tracked (US-018); every stage must resume exactly where it left off
   after a closed tab, and skipping must never fake completion.
7. **E2E** — extend `scripts/e2e-acceptance.sh` with the full onboarding-to-publication path.

## Acceptance

- A brand-new account reaches "published or exported with live URL recorded" without visiting any other page.
- Median founder active time in a timed run with 3 people who have never seen Banyan: < 30 minutes.
- Closing the tab at any stage and returning resumes at that stage with all input kept.

## Dependencies

Blocker 01 for the live-connect branch (export mode branch can ship first). Blocker 03 for draft quality.

## Stories

US-019, US-020, US-026 (optional brand step), US-038, US-039, US-040, US-041.
