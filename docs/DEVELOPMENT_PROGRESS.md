# Development Progress

Running log of MVP delivery. A story moves to Done only when its acceptance criteria are verified; the evidence column
says how. Story definitions: [USER_STORIES.md](USER_STORIES.md). Status source of truth:
`scripts/backlog/stories-*.mjs` (re-render with `node scripts/backlog/render.mjs`).

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| 0 — Repository audit | **Done** | [PROJECT_AUDIT.md](PROJECT_AUDIT.md); baseline 354/354 unit, 42/42 E2E, typecheck clean, build green (2026-11-01) |
| 1 — Backlog | **Done** | 77 stories, dependency graph, roadmap, acceptance criteria, sprint plan; generator validation passes |
| 2 — Infrastructure | **In progress**: US-001–US-006 Done; US-007, US-008, US-009 next | Compose stack verified 2026-11-01 (E2E 42/42 in Docker) |
| 3 — Authentication and onboarding | Not started | |
| 4 — Product intelligence | Not started | |
| 5 — SocialFlow.ai integration | Not started; live integration **blocked** | [SOCIALFLOW_INTEGRATION_AUDIT.md](SOCIALFLOW_INTEGRATION_AUDIT.md) |
| 6 — Strategy and content | Not started | |
| 7 — Campaign execution | Not started | |
| 8 — Credits and analytics | Not started | |
| 9 — Hardening | Not started | |
| 10 — Release | Not started | |

## Stories delivered before the brief (verified)

| Story | Evidence |
| --- | --- |
| US-013 Register | E2E "signup works" |
| US-014 Secure sessions | E2E login, wrong credentials, brute force, logout, session invalidated |
| US-016 Workspace isolation | E2E cross-workspace goal and content 404 |
| US-050 Edit with history | state-machine and campaign-pipeline unit tests; E2E review |
| US-051 Approve, reject, regenerate | E2E content approved by a human |
| US-052 Never publish unapproved | publishing-retry unit tests; E2E approval gate |
| US-053 Calendar | page compiled and served; no dedicated test yet |
| US-059 Recommendations from outcomes | E2E recommendation with confidence; learning unit tests |

## Story log

| Story | Status | Files | Tests | Blockers | Verification |
| --- | --- | --- | --- | --- | --- |
| US-001 Compose stack | Done | `docker-compose.yml`, `.env.example` | E2E 42/42 against the stack | — | All services healthy; volumes persist across down/up; web unhealthy with DB down, recovers; worker auto-restarts |
| US-002 Hardened image | Done | `Dockerfile`, `.dockerignore`, `package.json` (`build:worker`) | — | — | Node 22, uid 1000, 282 MB, HEALTHCHECK, graceful SIGTERM. Fixed: the old image could not run the worker (`tsx` pruned) and could not build (`scripts/` excluded) |
| US-003 Migrations first | Done | `docker-compose.yml` (`migrate`) | — | — | Migrate runs once before web/worker; a failure keeps them stopped with the cause logged |
| US-004 Docker docs | Done | `README.md`, `docs/DOCKER_DEPLOYMENT.md` | — | — | Every documented command executed |
| US-005 Job queue | Done | `src/lib/queue/*` | `tests/queue-and-claim.test.ts` (19) | — | Delayed jobs held in Redis; processed after worker restart |
| US-006 Queue worker | Done | `worker/index.ts`, `src/lib/maintenance.ts`, `src/lib/publishing/{claim,publish}.ts`, tick route | claim unit tests | — | Scheduled post attempted 229 ms after due from the queue; atomic claim prevents double delivery; sweep shared with the tick endpoint |

## Blockers

| Blocker | Stories | Owner | Next step |
| --- | --- | --- | --- |
| SocialFlow.ai has no deployable API (account connection, publish, status, webhooks, analytics) | US-032, US-035, US-036, US-037, US-060 | SocialFlow.ai team | Handoff in [SOCIALFLOW_INTEGRATION_AUDIT.md §5](SOCIALFLOW_INTEGRATION_AUDIT.md) |
| Production SMTP provider not chosen | US-010 (production use) | Product owner | Choose a provider; dev transport works meanwhile |

## Environment notes

- 2026-11-01, incident during US-001: the first Compose file gave its Postgres volume the global name `banyan-pgdata`,
  which the standalone dev database container already used. The Alpine Postgres rewrote the data directory's
  ownership, the standalone server lost access, and both briefly had the directory open. Recovery: ownership
  restored, standalone server restarted cleanly, `pg_amcheck --heapallindexed` passed on all 407 relations (no
  corruption). Fix: Compose volumes are now project-scoped and the file warns against global names. Only local
  development data was involved.
- Port 3000 on the development machine belongs to another application; the Compose stack runs on `WEB_PORT=3100`
  locally.

- 2026-11-01: the C: drive was full (0 MB). Docker's virtual disk was compacted (78.6 GB → 21.3 GB file, 59.5 GB free
  after), with the product owner's approval. All containers restarted with their data.
- Global npm config has `legacy-peer-deps=true`; `vite` is now an explicit devDependency so tests install anyway.
