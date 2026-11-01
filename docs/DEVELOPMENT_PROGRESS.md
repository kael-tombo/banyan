# Development Progress

Running log of MVP delivery. A story moves to Done only when its acceptance criteria are verified; the evidence column
says how. Story definitions: [USER_STORIES.md](USER_STORIES.md). Status source of truth:
`scripts/backlog/stories-*.mjs` (re-render with `node scripts/backlog/render.mjs`).

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| 0 — Repository audit | **Done** | [PROJECT_AUDIT.md](PROJECT_AUDIT.md); baseline 354/354 unit, 42/42 E2E, typecheck clean, build green (2026-11-01) |
| 1 — Backlog | **Done** | 77 stories, dependency graph, roadmap, acceptance criteria, sprint plan; generator validation passes |
| 2 — Infrastructure | **In progress**: US-001–US-007 and US-009 Done; US-008 next | Compose stack verified 2026-11-01 (E2E 42/42 in Docker) |
| 3 — Authentication and onboarding | **In progress**: US-018 Done, US-019 in progress | E2E 54/54 |
| 4 — Product intelligence | **Done except US-025 (in Review)**: US-021–US-024 Done | E2E 61/61 |
| 5 — SocialFlow.ai integration | **In progress**: US-027–US-030 and US-034 Done, US-031 in Review; live integration **blocked** | [SOCIALFLOW_INTEGRATION_AUDIT.md](SOCIALFLOW_INTEGRATION_AUDIT.md) |
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
| US-007 Shared rate limiting | Done | `src/lib/ratelimit.ts`, `src/lib/api-utils.ts`, 16 routes + health | `tests/ratelimit.test.ts` (5) | — | Limit survives a web restart (429 on attempt 11); Lua script makes check-and-record atomic; Redis outage degrades to per-process limiting |
| US-009 Readiness checks | Done | `src/app/api/health/route.ts` | live up/down/back check | — | Redis and queue backlog reported; 503 names Redis when it is down |
| US-018 Onboarding progress | Done | `prisma` (OnboardingStage, migration), `src/lib/onboarding/*`, `/api/onboarding/progress`, wizard | unit (11), E2E (6 new) | — | Nine stages; resume; optional skip; existing onboarded workspaces backfilled |
| US-019 Workspace basics | In progress | Workspace fields, wizard step 1 | E2E time zone checks | — | Schedule times not yet shown in the workspace time zone |
| US-021 URL analysis | Done | `src/lib/product/{analyze,analysis-runner}.ts`, analyze routes, worker job, `/app/product` | E2E (7) | — | Live progress on the review page |
| US-023 Profile review and approval | Done | `profile-review.ts`, apply-analysis and approve routes, `/api/profile`, goal gate, `/app/product` | unit (11), E2E (8) | — | Founder-written fields always kept; strategy gated on approval; versioning |
| US-022 Structured analysis | Done | `src/lib/product/analyze.ts`, router purpose | unit (22) | No live model key here | Model path proven with a mocked provider; basic path live |
| US-024 Untrusted content | Done | `src/lib/ai/untrusted.ts` | unit (9) | — | Sanitise, flag, fence, rules |
| US-025 Analysis failures | Review | failure codes and messages, retry and describe-it-yourself UI | unit (6), E2E | — | Failure state not yet rendered on screen |
| US-027 Distribution interface | Done | `src/lib/distribution/{types,providers}.ts`, `publish.ts` | unit 375/375 | — | Provider-neutral interface with normalised errors; registry empty until SocialFlow.ai is verified |
| US-028 Postiz removed | Done | deleted `postiz.ts`, `LivingTree.tsx`, `branches.ts`; connections API; migration `20261101120000_remove_postiz`; capability registry; Publishing UI | E2E 43/43 (new: postiz connection refused) | — | Old rows kept as `removed`. The E2E SSRF check moved from the deleted connection probe to product intake, the remaining user-URL fetch |
| US-029 No Postiz claims | Done | landing, walkthrough, cycle record, privacy, onboarding, nav, agents, formats, README, docs/API.md | Publishing page rendered in Docker | — | Every surface describes SocialFlow.ai (not yet available) and export mode |
| US-030 SocialFlow contract | Done | `src/lib/distribution/socialflow/contract.ts` | `tests/socialflow-contract.test.ts` (28) | SocialFlow.ai API does not exist | Proposal for the SocialFlow team, labelled unverified; every success and failure path exercised against a schema-built mock |
| US-031 SocialFlow adapter | **Review** | `src/lib/distribution/socialflow/{client,adapter}.ts`, `providers.ts`, `safe-fetch.ts` (DELETE) | contract tests | Live use blocked on SocialFlow.ai | Disabled unless verified. Needs the worker + database path against the mock (US-074) before Done |
| US-034 Export mode | Done | `src/lib/distribution/export.ts`, export routes (content, campaign), editor, `publish.ts` (idempotent manual recording) | `tests/export-mode.test.ts` (5), E2E 47/47 | — | Export carries the post's tracked link; re-recording the same URL is idempotent (also under concurrency, via a unique key); found and fixed: the approval check ran before the idempotency check |

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
- Port 3000 was held by an orphaned `next dev` from this session (stopping a background task left its child Node
  process running), not by another application as first recorded. It is still running (pids 14124, 17748): stopping
  it needs the product owner's permission. The Compose stack stays on `WEB_PORT=3100` locally; the port is configurable.

- 2026-11-01: the C: drive was full (0 MB). Docker's virtual disk was compacted (78.6 GB → 21.3 GB file, 59.5 GB free
  after), with the product owner's approval. All containers restarted with their data.
- Global npm config has `legacy-peer-deps=true`; `vite` is now an explicit devDependency so tests install anyway.
