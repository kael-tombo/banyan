# 12 — The cycle has never been proven end to end

## Problem

Every stage has unit tests and a 42-check API script, but no complete cycle has ever run with real accounts,
real posts and a real measured visit. The MVP's own definition of done has not been met once.

## Evidence

- STRATEGY.md §11: "If this workflow cannot run with real accounts and real numbers, the promise is not met."
- progress.md: milestone 3 (Growth) "Not started — requires real attributed signups; none observed".
- US-074 (MVP journey in Docker) and US-075 (failure paths) Backlog — the last two links of the critical path.
- US-077 (landing page states the MVP promise) Backlog.

## Why it blocks the promise

This is the promise. Everything in blockers 01–11 is in service of passing this gate. Appendix C: "**Do not
launch** until the cycle gate passes."

## Plan, step by step

1. **US-074 — automated journey in Docker**: a Playwright (or extended `e2e-acceptance.sh`) run against
   `docker compose up`: signup → onboarding → URL intake → profile approve → strategy approve → 3 drafts approve
   → publish (mock provider in CI) → tracked click → attributed signup → cycle report → next-cycle proposal.
   Runs in CI on every PR to main.
2. **US-075 — failure suite**: model down, URL unreachable, token expired, rate-limited, partial thread, edit
   after approval, insufficient credits, worker restart mid-job, duplicate webhook. Each asserts a visible state
   and correct credits.
3. **Banyan distributes Banyan** (vision principle 10): run the first real cycle on Banyan itself — real
   LinkedIn and X accounts, the scenario in §11, the founder timing their own active minutes.
4. **Scorecard** — fill the §11 acceptance table with evidence (URLs, timestamps from blocker 08, screenshots)
   in `docs/mvp-blockers/CYCLE_PROOF.md`. Any miss → fix → re-run.
5. **Design partners** — 10 founders, supervised. Gate: 8/10 complete a cycle; kill signal: fewer than 6.
6. **US-077 — landing page** states exactly the promise that was proven, nothing more (no "autonomous", no
   unverified channels).
7. **Update** progress.md milestone 2 → Met and milestone 3 → In progress only when an attributed signup is
   observed.

## Acceptance

All rows of STRATEGY.md §11's acceptance table are met with linked evidence for Banyan's own cycle, and at least
8 of 10 design-partner cycles complete.

## Dependencies

Blockers 01–05 are required; 06, 07, 10 required before outside founders; 08 required to score it; 09 and 11
required for the paid launch.

## Stories

US-074, US-075, US-077.
