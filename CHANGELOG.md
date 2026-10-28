# Changelog

All notable changes to Banyan. Dates are 2026 (the build window). Formats
follow [Keep a Changelog](https://keepachangelog.com); commit hashes refer to
`main` on `github.com/kael-tombo/banyan`.

---

## [Unreleased]

### Added
- **SocialFlow.ai integration boundary + manual handoff** — verified that no
  SocialFlow.ai API exists (socialflow.ai is a parked domain as of 2026-10-28;
  no developer docs, auth model, or endpoints — evidence in
  `docs/SOCIALFLOW_INTEGRATION.md`). Shipped the honest path instead:
  `src/lib/publishing/socialflow.ts` (capability contract + handoff builder,
  unit-tested), `GET /api/content/[id]/handoff` (workspace-scoped,
  copy-ready channel-formatted package), a "SocialFlow.ai handoff" action on
  every content item feeding the existing manual-publication recording, and
  an `unavailable` capability-registry entry citing the evidence. Activation
  checklist included for when a real API appears — a connector-only change.
- Documentation set completed: `docs/ARCHITECTURE.md` (system design),
  `docs/DATA_MODEL.md` (entities, relations, state machines),
  `docs/API.md` (endpoint reference), `docs/TESTING.md` (unit + E2E guide),
  `docs/SECURITY.md` (posture + gaps), this changelog, and
  `CONTRIBUTING.md`.

### Changed
- **Database provider switched: SQLite → PostgreSQL (hosted, e.g. Prisma
  Postgres)** — removes the serverless ephemerality limitation; data is now
  durable across cold starts and instances on Vercel. `prisma/schema.prisma`
  provider is `postgresql`; the two SQLite-era migrations were replaced by
  one baseline migration (`20261028120000_postgres_init`, generated via
  `prisma migrate diff`). `npm run build` now deploys pending migrations
  automatically when a real `DATABASE_URL` is configured
  (`scripts/migrate-if-configured.ts`; skip with `MIGRATE_ON_BUILD=0`;
  clean-room/placeholder builds skip safely). The SQLite runtime bootstrap
  and its generated-DDL machinery were retired with the provider (demo
  seeding now lives in `src/lib/bootstrap/seed-demo.ts`, shared by
  `prisma/seed.ts`; provision a fresh database once with
  `npx prisma migrate deploy && npm run db:seed`). `prisma` CLI moved to
  `dependencies` so the Docker entrypoint's migrate-deploy works after
  `npm prune --omit=dev`. CI (unpushed, workflow-scoped) updated to a
  postgres:16 service container. Docs updated across README, runbook,
  architecture, data model, security and launch notes.

### Fixed
- **Demo login on serverless deployments** (`founder@banyan.ai` /
  `banyan-demopass` returned "unable to authenticate") — on Vercel, neither
  migrations nor seed ever run at runtime, so the database had no tables and
  no demo account. Added a **runtime demo bootstrap**:
  `src/instrumentation.ts` provisions the SQLite schema (migration DDL
  embedded at build time by `npm run gen:schema` →
  `src/lib/bootstrap/schema.generated.ts`, drift-checked by a unit test) and
  the shared demo seed (extracted to `src/lib/bootstrap/seed-demo.ts`,
  reused by `prisma/seed.ts`) on cold start and on the first
  login/signup request; idempotent, race-tolerant, kill-switch
  `RUNTIME_DB_BOOTSTRAP=0`. Verified by a live production-server simulation
  on a fresh `/tmp` database (66/66 statements, seed created, demo login 200,
  wrong password 401) plus the full 42-check E2E acceptance on the durable
  path. Runbook §4 and README document the exact Vercel env recipe
  (`DATABASE_URL=file:/tmp/banyan.db`, `APP_SECRET`, `WORKER_SECRET`) and
  the ephemerality caveats.
- **Vercel/serverless build failure** — `next build` aborted during
  "Collecting page data" with `Invalid environment configuration —
  DATABASE_URL: Required; APP_SECRET: Required` on any machine without
  project secrets (reproduced on a clean-room clone, 2026-10-28). Fix:
  `src/lib/env.ts` now fills required values with inert placeholders during
  the build phase only (`NEXT_PHASE=phase-production-build`); production
  runtime still fails fast without real values (pinned by new tests in
  `tests/env.test.ts`). `npm run build` now runs `prisma generate` first
  (deterministic client generation on fresh installs, mirroring the
  Dockerfile). `allowScripts` entries aligned to the actual locked prisma
  chain versions (6.12.0), so prisma install scripts are no longer silently
  skipped by npm's script approval. Runbook §4 gained a "Vercel alternative"
  section with the required runtime env vars and the honest SQLite-on-
  serverless ephemerality caveat; README gained a "Deploying" section.

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
