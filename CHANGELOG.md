# Changelog

All notable changes to Banyan. Dates are 2026 (the build window). Formats
follow [Keep a Changelog](https://keepachangelog.com); commit hashes refer to
`main` on `github.com/kael-tombo/banyan`.

---

## [Unreleased]

### Added
- Documentation set completed: `docs/ARCHITECTURE.md` (system design),
  `docs/DATA_MODEL.md` (entities, relations, state machines),
  `docs/API.md` (endpoint reference), `docs/TESTING.md` (unit + E2E guide),
  `docs/SECURITY.md` (posture + gaps), this changelog, and
  `CONTRIBUTING.md`.

### Pending (needs a scoped token)
- `.github/workflows/ci.yml` is written and committed-ready but **not yet
  pushed** — pushing workflow files requires a PAT with `workflow` scope.
  It runs: migrate-deploy on a fresh DB → typecheck → unit tests →
  production build, on push/PR.

## [0.3.0] — 2026-10-28 · Launch readiness

Public-launch hardening for the October 31 release. 173 unit tests,
42-check E2E acceptance, production build green.

### Security (P0/P1 from the launch audit)
- **SSRF choke point** (`e5debfa`) — `src/lib/net/safe-fetch.ts`: http(s)-only,
  DNS-resolved private-IP/metadata rejection, re-validated redirects (≤3),
  response size cap; wired into the Postiz adapter; 41 unit tests; live
  verified.
- **Uniform 512 KB JSON body cap** (`af2d6b8`) — `readJson` across all 25
  mutating routes (413 oversize, 400 malformed).
- **Fail-fast production env** (`27d7a45`) — missing/dev-default
  `WORKER_SECRET` rejected at boot; session secret read via validated env;
  root `not-found.tsx` + `global-error.tsx`.
- **Dependency remediation** (`a5c2174`, `e6baf60`) — prisma-chain fix +
  vitest 3→5; critical advisories cleared (10 → 5, majors deferred with
  rationale).

### Operations
- **Dockerfile + .dockerignore** (`d5b420f`) — multi-stage, migrate-on-start,
  `/app/db` volume (first build pending a docker daemon).
- **E2E acceptance script** (`a9a82cb`) — `scripts/e2e-acceptance.sh`: the
  full founder journey + failure cases against a live server (42/42 PASS);
  `scripts/cleanup-e2e.ts` for teardown.

### Docs
- **Launch audit + frozen backlog** (`2a9accb`) — evidence-based P0/P1/P2/P3.
- **Release runbook + launch assets** (`aa7166a`) — env vars, migrations +
  backup, deploy steps (Node + Docker), smoke checklist, monitoring, rollback;
  announcement draft + 5-minute demo script + honest limitations.

## [0.2.0] — 2026-10-28 · Agentic execution runtime

The core upgrade: Banyan now *executes* distribution work with persisted,
auditable state. 44 → 120+ tests.

### Added
- **Goal → plan → approval → autonomous execution** (`c658444`) —
  natural-language goals (`nl-goal.ts`), planner with human plan approval,
  6 agent roles / 11 task types, pure orchestration graph (`graph.ts`) with
  dependency resolution, observer bypass, crash-recovery leases, bounded
  retries, atomic task claims, output verification (`verify.ts`), idempotent
  workflow template (unique dedupe keys), central orchestrator.
- **Model router** (`src/lib/model/`) — managed-first provider resolution,
  per-workspace daily quota, `ModelCall` usage ledger (tokens/latency/
  micro-USD cost), labelled template fallback.
- **Capability registry** (`src/lib/capabilities/`) — honest health statuses
  (`available/needs_credentials/unverified/unavailable`); Postiz, managed
  model, web-research (honest unavailable), Fastlane adapter (implemented
  against the documented API, unverified until exercised).
- **Business context with provenance** — `ProfileFact`
  (verified/user_provided/external_observation/hypothesis) +
  `/app/context` management UI; prompts render provenance labels.
- **Outcome intelligence** — measure/evaluate/recommend agents producing
  evidence-cited recommendations; evidence-less results forced to low
  confidence with disclosed uncertainty.
- **UI** — `/app/goals` + goal cockpit (plan, approvals, blockers, tasks,
  records, recommendations, live auto-advance), dashboard reworked
  execution-first, permissions layer (owner/member/viewer).
- **Publishing retries** (`d31a460`) — bounded, jittered backoff with
  terminal/transient classification.
- Fixed a latent bug: `isExportableContent` rejected the transient
  `publishing` state, so immediate publish always failed (regression-tested).

### Landing
- **Logo kit applied** (`578e675`), animation pass (`c81ca2d`), white banyan
  redesign (`e34c5c6`), modern redesign (`38acdac`) — Inter typography,
  geometric animated banyan with agent dots, glass hero cards, channel
  marquee, bento grid, philosophy spine; reduced-motion safe; desktop +
  mobile browser-verified.

## [0.1.0] — 2026-10-27 · Initial bring-up

The repo was found mid-build: 39 TypeScript errors, no tests, no README, no
seed, no worker entry — unstyled and non-compiling.

### Fixed
- Compilation (`fc87ce4`) — all 39 pre-existing type errors; root layout now
  imports `globals.css` (the app previously rendered unstyled end to end).
- Broken `parseJson` call pattern in request handling.

### Added
- Tracked links restored end-to-end (`c2cca70`) — `/t/[slug]` redirect route,
  click recording, visitor-cookie attribution; seed script; worker entry
  point.
- Missing dashboard pages (`6159861`) — approvals, calendar, publishing,
  analytics, experiments, settings, growth, content/new.
- Unit tests for the pure domain logic (`d6057e7`) — 32 tests at the time.
- Onboarding made optional instead of a gate (`e6fbccb`); grouped navigation,
  mobile menu, page states (`d7a3acc`); app redesign (`7c221a4`).
- Docs: README + implementation report (`7a83579`); vision, philosophy,
  progress, worklog (`dd6c867`).
