# Progress

Living status board. Updated as work lands. Companion to
[`worklog.md`](worklog.md) (what changed, when) and
[`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md) (detailed report).

**Last updated:** 2026-10-28

## Milestones

| # | Milestone | State | Evidence |
| --- | --- | --- | --- |
| 1 | **Capability** — the product can run the whole loop | Met | goal → plan → campaign → content → approval → publish → measure → learn is implemented and reachable; 48 routes build |
| 2 | **Reliability** — behaves correctly under real conditions | In progress | approvals, idempotency, rate limiting, and **bounded retries with backoff for transient publication failures** enforced server-side; unit-tested domain logic; real publishing still unverified, no integration/e2e tests |
| 3 | **Growth** — real campaigns produce measurable outcomes | Not started | requires real attributed signups; none observed |

Milestone 3 is deliberately not claimed. Capability and reliability do not imply it.

## What works today

- **Auth & tenancy** — signup, login, cookie sessions, workspace isolation on every route.
- **Onboarding** — optional six-step wizard; skippable; app usable without it.
- **Workspace** — product profile, audience, goal, channels, brand voice.
- **Audience** — insight records with source and confidence.
- **Campaigns** — create, filter, duplicate, detail, status transitions.
- **Content** — channel/format drafts, generation, revisions, editing.
- **Approval** — queue, approve/reject; enforced server-side.
- **Calendar** — scheduled, approved-but-unscheduled, and confirmed publications.
- **Publishing** — connection management (Postiz), re-test, disconnect, blocked states, and automatic bounded retry of transient failures (network, timeout, rate limit) via the worker queue.
- **Analytics** — tracked links, first-party funnel, manual metrics, provenance labels.
- **Experiments** — create, run, draft evidence-based conclusions.
- **Growth** — Banyan's own self-distribution view with honest milestones.
- **Measurement loop** — `/t/[slug]` records clicks and attributes later signups.
- **Tooling** — `npm run setup` (migrate + seed), `npm run worker`, 44 unit tests.

## Partial

- **Publishing** — adapter, lifecycle, idempotency, blocked states, and bounded automatic retry of transient failures implemented;
  **never exercised against a live Postiz account**.
- **Analytics** — provider engagement metrics only exist when an adapter reports
  them (Postiz reports none); manual entry is the only source today.
- **AI generation** — works against any OpenAI-compatible endpoint; without a key it
  uses an always-labelled local template.

## Not started

- Durable agent orchestration (no `Goal` / `AgentRun` / `TaskRun` models or task graph).
- Dedicated learning-record entity with provenance (conclusions currently live on `Experiment`).
- Notifications, usage/budget enforcement.
- PostgreSQL, object storage, multi-user collaboration.
- API integration and end-to-end test suites.
- Reviewed legal copy.

## Next up

1. **Prove one real publication** end to end with a Postiz account and record what
   the provider actually returned — closes the largest verification gap.
2. **API integration tests** for workspace isolation, approval enforcement,
   publication idempotency and tracked-link attribution.
3. **Minimal durable task runtime** (persisted plan + task states, retries, an
   approval pause) to replace single-pass planning.

## How to verify the current state

```bash
npm install
cp .env.example .env      # set APP_SECRET
npm run setup             # migrate + seed
npm run typecheck         # 0 errors
npm test                  # 44 passing
npm run build             # 48 routes
npm run dev               # sign in: SEED_USER_EMAIL / SEED_USER_PASSWORD
```
