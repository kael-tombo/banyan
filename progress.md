# Progress

Living status board. Updated as work lands. Companion to
[`worklog.md`](worklog.md) (what changed, when) and
[`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md) (detailed report).

**Last updated:** 2026-10-28

## Milestones

| # | Milestone | State | Evidence |
| --- | --- | --- | --- |
| 1 | **Capability** — the product can run the whole loop | Met | goal → plan → campaign → content → approval → publish → measure → learn is implemented and reachable; 48 routes build |
| 2 | **Reliability** — behaves correctly under real conditions | In progress | approvals, idempotency, rate limiting, bounded publication retries, fail-fast env guards, SSRF choke point, uniform body caps enforced server-side; **331 unit tests + 42-check live E2E acceptance (42/42 PASS)**; real publishing still unverified against live Postiz credentials |
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
- **Tooling** — `npm run setup` (migrate + seed), `npm run worker`, 331 unit tests, 42-check E2E acceptance script, Dockerfile + CI workflow.

## Partial

- **Publishing** — adapter, lifecycle, idempotency, blocked states, and bounded automatic retry of transient failures implemented;
  **never exercised against a live Postiz account**.
- **Analytics** — provider engagement metrics only exist when an adapter reports
  them (Postiz reports none); manual entry is the only source today.
- **AI generation** — works against any OpenAI-compatible endpoint; without a key it
  uses an always-labelled local template.

## Not started

- Notifications; PostgreSQL, object storage, multi-user collaboration.
- Live website scraping (deliberately deferred — avoids the SSRF class for analysis).
- Fastlane adapter activation (needs `FASTLANE_API_KEY` verification).
- Reviewed legal copy.

## Next up

1. **Push the CI workflow** — `.github/workflows/ci.yml` is written; pushing it needs a token with `workflow` scope (contents-write is not enough).
2. **Validate the Docker build** on a machine with a docker daemon.
3. **Prove one real publication** end to end with live Postiz credentials.
4. **Production hosting + domain**, then run the runbook smoke checklist.

## How to verify the current state

```bash
npm install
cp .env.example .env      # set APP_SECRET
npm run setup             # migrate + seed
npm run typecheck         # 0 errors
npm test                  # 200 passing
npm run build             # production build green
BASE_URL=http://localhost:3000 bash scripts/e2e-acceptance.sh   # 42 checks
npm run dev               # sign in: SEED_USER_EMAIL / SEED_USER_PASSWORD
```

## Agentic execution runtime (2026-10-28)

**Done**
- Goal entity with NL creation, structured plan, human approval gate, progress
- Orchestrator with persisted task state, retries, crash recovery, parallel-safe batching, verification
- Full distribution workflow as agent tasks: research → strategy → campaign → content → approval → publish → measure → evaluate → recommend
- Business context with provenance (ProfileFact) + inspect/correct UI (/app/context)
- Model router separate from runtime: managed access first, quotas, usage ledger, labeled fallback
- Capability registry incl. Fastlane evaluation (creative/schedule/analytics verified from docs; adapter unverified until credentials; brand analysis not offered by vendor)
- Evidence-backed recommendations with disclosed uncertainty
- 116 unit tests covering transitions, graph resolution, failure recovery, verification, parsing, quotas, permissions
- Execution-first dashboard and goal cockpit UI

**Partial**
- Fastlane adapter: implemented against documented API, needs credentials + live verification
- Publishing: works end-to-end only with a configured Postiz connection; otherwise honestly blocked

**Not started**
- Long-running scheduler (multi-day task pacing), multi-campaign waves, inter-workspace delegation
- External research provider (no verified source available)

## Launch readiness (2026-10-28)

**Done**
- Launch audit (docs/LAUNCH_AUDIT.md) + frozen backlog (docs/LAUNCH_BACKLOG.md); all P0 and P1 items shipped with verification evidence
- Security: SSRF safe-fetch choke point; uniform 512 KB body caps; fail-fast production `WORKER_SECRET`; root 404 + global error boundary; dependency criticals cleared (vitest 5, prisma chain)
- E2E acceptance script committed — 42/42 checks PASS against a live server
- Dockerfile + .dockerignore; CI workflow written (push pending workflow-scoped token)
- Release runbook (docs/RELEASE_RUNBOOK.md) + launch assets (docs/LAUNCH.md)

**Partial**
- ci.yml not yet pushed (GitHub requires `workflow` scope on the PAT)
- Docker image not yet built (no daemon in the build sandbox)

**Documentation set completed (2026-10-28)**
- docs/ARCHITECTURE.md, docs/DATA_MODEL.md, docs/API.md, docs/TESTING.md, docs/SECURITY.md, CHANGELOG.md, CONTRIBUTING.md; README refreshed (173 tests, full document index)

## Vision application — second pass (2026-10-28)

**Done**
- Connections page (growth loop setup N-of-5, data flow pipeline with flowing/stalled health, data quality panel, access & data use trust section) under nav "System"
- Dashboard Agent team panel (6 roles, live status from the AgentTask audit trail) + Recent activity feed (ActivityEvent rendered with evidence links) + attribution coverage signal
- `src/lib/growth-loop.ts` pure helpers + 19 tests → 200/200 unit tests, E2E 42/42, build green, browser-checked 1440/390px

## Learning memory (2026-10-30)

**Done**
- Concluded experiments are now reusable context: `src/lib/learning-memory.ts` (pure) qualifies only complete + interpreted experiments, orders them, and renders bounded word-safe prompt lines.
- Plan draft, research, strategy and channel content prompts (agent and manual generation) receive a labelled "Prior learning" block, read from the Experiment records at call time — no duplicated learning table to drift.
- Command-center chat carries the newest conclusions in its brief and the labelled fallback surfaces the latest one.
- `/app/context` has a visible "Learning memory" section with interpretation, limits, next action and an honest empty state.
- Tests: 331/331 (16 for learning memory + 2 chat assertions, 18 new), typecheck clean, production build green; live browser verification of the memory card and a chat answer quoted from the concluded experiment; E2E acceptance 42/42.

**Partial**
- Learning is per workspace and only as good as the recorded interpretation; it is not statistical evidence and the UI says so.
- An experiment marked complete without an interpretation is excluded (shown as "needs decision" on Experiments) until conclusions are recorded.

**Not started**
- Cross-workspace or cross-product learning; automatic re-running of a follow-up experiment from a conclusion.
