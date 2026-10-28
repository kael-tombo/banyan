# Worklog

Chronological record of changes. Newest entries at the bottom.

---

## 2026-10-27 — Repository audit and repair

**Starting point.** A substantial but non-compiling Banyan.ai MVP: Next.js 15 +
Prisma/SQLite, domain layer and API routes largely written, no tests, no README.

### `fc87ce4` — fix: make the project compile and stop rendering unstyled

The project had 39 TypeScript errors, and two of them were real runtime defects
rather than type noise:

- The body-parsing helper inferred a schema's **input** type instead of its output,
  and routes called it with an already-parsed body while it tried `req.json()` —
  every POST/PATCH route would have thrown.
- `src/app/layout.tsx` never imported `globals.css`, so **no page had any CSS**.
  The whole app rendered as unstyled text.

Also corrected wrong Prisma query shapes (`Publication` is reached via
`contentItem`, not a `workspaceId` column), a missing `"metric"` activity type, and
several prop/type mismatches in forms.

### `c2cca70` — feat: restore tracked links, seeding and the publishing worker

The measurement loop was dead: `trackedLinkUrl()` pointed at `/t/[slug]`, which had
no route, and `recordClick()` was never called. Added the redirect route (records
the click, sets the visitor cookie for attribution, restricts redirects to
http/https), the missing `prisma/seed.ts` (so `npm run setup` works, and Banyan has
its own self-distribution workspace), and `worker/index.ts` (so `npm run worker`
works).

### `6159861` — feat: add the dashboard pages that were linked but missing

`/app/approvals`, `calendar`, `publishing`, `analytics`, `experiments`, `settings`,
`growth` and `content/new` were referenced from the navigation and dashboard but did
not exist — dead links throughout the app. All implemented against real queries.

### `d6057e7` — test: add unit tests for the pure domain logic

Vitest configuration plus 32 tests covering workflow state machines, channel/format
validation, experiment summaries, secret encryption, rate limiting and AI output
schemas.

### `7a83579` — docs: add README and implementation report

Setup, architecture, routes, and an honest status report that separates what works
from what is unverified.

### `e6fbccb` — feat: make onboarding optional instead of a gate

New accounts were redirected out of the app until a six-step onboarding form was
finished, which blocked the product behind setup. Everyone now lands in the app;
an in-app prompt and a "Skip for now" link in the wizard guide setup without
preventing use.

### `d7a3acc` — feat(ui): group navigation, add a mobile menu and page states

Eleven flat nav items became three groups (plan / distribute / measure), with a
real collapsible mobile menu replacing a cramped horizontal strip. Added a skip
link, a loading skeleton, a recoverable error boundary, automatic label-to-control
association for form fields, and a confirmation before deleting an insight.

### Verified after each change

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass (0 errors, was 39) |
| `npm test` | Pass — 32 tests |
| `npm run build` | Pass — 48 routes |
| `npm run setup` | Pass — migration + seed |
| Runtime smoke | Public routes 200; protected → redirect to login; tracked link records a click; all authenticated pages 200; styled output confirmed in the browser |

---

## 2026-10-28 — Bounded retry policy for publications

### feat: retry transient publication failures with backoff (commit pending)

Before this change, any provider hiccup permanently failed the publication and
the content — a 30-second Postiz outage or one 429 killed a scheduled post for
good, with the user left to notice and restart it by hand.

- **`src/lib/publishing/retry.ts` (new)** — pure retry policy: transient vs
  permanent classification, `MAX_PUBLISH_ATTEMPTS = 4`, exponential backoff from
  one minute capped at thirty, deterministic 15% jitter, explicit provider
  `Retry-After` honored but also capped. Unknown errors are permanent by
  default — a retry must be a conscious policy decision, not a default.
- **Postiz adapter** now classifies HTTP statuses (408/429/5xx transient; other
  4xx permanent), parses `Retry-After`, and marks its own network/timeout
  failures transient. `PublishResult` gained `retryable` / `retryAfterMs`.
- **`executePublication`** on a transient failure reschedules the publication
  and rolls the content back to `scheduled` (a state-machine extension:
  `publishing → scheduled`), so the worker re-attempts it through the *same*
  guarded path — approval is re-verified and the duplicate-publication check
  still applies. Retries keep the existing publication row (same
  `idempotencyKey`), never create a second one.
- **Terminal after four attempts**: `publication_failed` with the full attempt
  count in the audit summary.
- **12 new tests** (44 total): classification of transient classes, the
  attempt cap, exponential growth, the cap, `Retry-After` handling, and jitter
  bounds.

Known limitation recorded honestly: a retry after a partial provider success
(e.g. the post landed but the response was lost) could duplicate a post, because
Postiz's public API offers no verified idempotency token. The bounded attempt
cap keeps the blast radius small; a dedup-by-`group` probe against a live
account remains the real fix.

## 2026-10-28 — Agentic execution and distribution upgrade

- New persistent execution model: `Goal`, `GoalPlan`, `AgentTask`, `TaskRun`,
  `ProfileFact`, `Recommendation`, `ModelCall` (+ `Campaign.goalId`).
  Migration `20261028072735_agentic_execution_runtime`.
- Central orchestrator (`src/lib/agents/orchestrator.ts`): dependency
  resolution, crash-recovery leases, bounded transient retries, parallel
  execution for independent tasks only, verification-before-completion,
  publish reconciliation, cached goal progress. Pure decision logic in
  `graph.ts` is unit-tested without a database.
- Agent handlers: plan_draft (human approval gate), research, strategy,
  campaign_plan, content_draft, approval_gate, publish, measure, evaluate,
  recommend — all with honest fallbacks and explicit outcomes.
- Model router (`src/lib/model/router.ts`): managed-first provider resolution,
  per-workspace daily live-call quota (`MODEL_MAX_CALLS_PER_DAY`), full usage
  ledger (`ModelCall`) with token/cost estimates, labeled template fallback.
- Capability registry (`src/lib/capabilities/`): Postiz, managed model,
  web-research (honest `unavailable`), and a Fastlane adapter implemented
  against Fastlane's documented API (creative/scheduling/post analytics;
  brand analysis does not exist in their API) — marked `unverified` until
  exercised with `FASTLANE_API_KEY`.
- Natural-language goal creation with deterministic heuristic parsing
  (`nl-goal.ts`) validated against model-based extraction; no invented
  numbers or dates.
- API: goals CRUD, plan approve/reject, advance, task retry/cancel/approve
  gate, profile facts with provenance corrections, usage summary; worker tick
  now advances workflows too.
- UI: Goals list + NL creation, goal execution cockpit (plan with assumptions
  and missing info, approve/reject, live task state, execution records,
  evidence-backed recommendations), Business Context page with provenance
  badges and corrections, dashboard reworked to be execution-first, nav adds
  Goals and Context.
- Fixed a latent publish bug: `isExportableContent` now accepts the
  publisher's transient `publishing` state (recorded approval still required).
- Tests: 44 → 116 (state machines, graph, failure recovery, verification, NL
  parsing, quotas, capabilities honesty, recommendation evidence, permissions).
- Verified end to end against a running server: NL goal → plan → approval →
  research/strategy/campaign → content draft → human approval → honest
  blocked publish → honest zero measurement → "not enough data" evaluation →
  evidence-backed low-confidence recommendation. Full narrative in
  `docs/AGENTIC_RUNTIME.md`.

## 2026-10-28 — Landing redesigns

- White banyan redesign (`e34c5c6`): animated hero tree (SVG banyan grows
  trunk → canopy → aerial roots → channel chips), bento runtime grid,
  philosophy section, reduced-motion safe, scoped to marketing surfaces.
- Modern redesign (`38acdac`): Inter via next/font, gradient hero + glass
  cards, geometric banyan with travelling agent dots (CSS offset-path),
  channel marquee, 9-cell bento, timeline how-it-works; fixed nested-<p>
  hydration and tree rendering defects found via browser screenshots.
  Desktop + mobile browser-verified; 120/120 tests, build green.

## 2026-10-28 — Launch mission (audit → fixes → acceptance)

- Phase A audit (`2a9accb`): evidence-based findings frozen into
  docs/LAUNCH_AUDIT.md + docs/LAUNCH_BACKLOG.md (P0/P1/P2/P3).
- SEC-2/SEC-4/ERR-1 (`27d7a45`): production WORKER_SECRET fail-fast (also
  rejects the dev default), session secret via validated env, root
  not-found + global-error.
- SEC-1 (`e5debfa`): src/lib/net/safe-fetch.ts — SSRF choke point
  (protocol/DNS private-IP/metadata/redirect/size guards) wired into the
  Postiz adapter; live-verified metadata + loopback blocked, no body echo.
- SEC-3 (`af2d6b8`): readJson 512 KB body cap across 25 mutating routes;
  live 413/400 verified.
- DEP-1 (`a5c2174`, `e6baf60`): prisma-chain audit fix + vitest 3→5
  (criticals cleared, advisories 10→5); NEXT_PHASE build exemption for the
  runtime env guard (build caught it on secret-less machines).
- OPS-1 (`d5b420f`): Dockerfile (multi-stage, migrate-on-start) +
  .dockerignore. ci.yml written locally — push requires a workflow-scoped
  token.
- E2E-1 (`a9a82cb`): scripts/e2e-acceptance.sh — 42/42 checks PASS live
  (signup → onboarding → goal → plan gate → agents → content review →
  honest blocked publish → manual publication → experiment → results →
  recommendation → persistence → isolation 404s → 413/400/SSRF/logout).
- Deliverables D+E (`aa7166a`): docs/RELEASE_RUNBOOK.md + docs/LAUNCH.md;
  backlog verification log updated.
- Final sweep: typecheck clean, 173/173 tests, production build green.

## 2026-10-28 — Documentation set completed

- New: docs/ARCHITECTURE.md (layers, request lifecycle, agent runtime,
  provider boundaries, extension points, known limits), docs/DATA_MODEL.md
  (23 entities, relationships, all state machines, schema conventions),
  docs/API.md (every endpoint: method, auth, role, rate limit, body),
  docs/TESTING.md (unit suite map, E2E run, quality gates), docs/SECURITY.md
  (threat model, verified controls, known gaps, reporting),
  CHANGELOG.md (release history from the git log), CONTRIBUTING.md
  (setup, workflow, quality gates, engineering rules, docs map).
- Updated: README.md (test counts 116→173, testing section, full document
  index), progress.md (milestone evidence, current next-up, launch
  readiness + documentation sections), this worklog.
- Verified before commit: typecheck clean, 173/173 tests.

## 2026-10-28 — SocialFlow.ai distribution integration (boundary + manual handoff)

- Verification (directive-mandated, evidence recorded in
  docs/SOCIALFLOW_INTEGRATION.md §1): socialflow.ai is a PARKED DOMAIN for
  sale; no developer portal, API docs, auth model, endpoints, media spec,
  platform coverage, rate limits, or error docs exist for the product (web
  search + direct fetch, Oct 28 2026). No API client was built and nothing
  is simulated — per the directive's scope-control rule.
- Implemented instead:
  - src/lib/publishing/socialflow.ts — SOCIALFLOW_REQUIRED_CAPABILITIES
    contract + buildSocialFlowHandoff/socialflowHandoffToText (pure,
    channel-formatted, video-script extras, execution checklist ending in
    recording the live URL).
  - GET /api/content/[id]/handoff — workspace-scoped, read-only handoff
    package ({handoff, text, approved, itemStatus}); cross-tenant 404.
  - Editor UI: "SocialFlow.ai handoff (manual execution)" — copies the
    package, states the approval requirement honestly; feeds the existing
    manual-publication recording (mode: "manual").
  - Capability registry: socialflow entry reports "unavailable" with the
    evidence; /app/publishing connector card updated ("manual handoff only").
  - Connections API still only accepts adapter "postiz" — nothing storable
    until an adapter exists.
- Status mapping, authorization, idempotency/no-blind-retry guarantees, and
  the activation checklist (connector-only future change) documented in
  docs/SOCIALFLOW_INTEGRATION.md; README, AGENTIC_RUNTIME.md, API.md,
  CHANGELOG, progress.md updated.
- Tests: +8 (handoff package, video extras, defensive parsing, capability
  contract, registry honesty) → 181/181 pass; typecheck clean; production
  build green.

## 2026-10-28 — Distribution OS vision applied to main app + landing

Sources: three founder-provided reference screenshots ("Distribution OS" growth
workspace dashboard, marketing site, agentic growth-strategy page). The vision's
information architecture was applied; the visual identity stays White Banyan
(forest/fig, rooted cards, serif headers). Honesty rules unchanged: every number
rendered is recorded data; the landing mockup is labeled illustrative.

- Landing (`src/app/page.tsx`): split hero per the vision — "Turn your product
  into a distribution system." + DISTRIBUTION WORKSPACE pill + product-URL form
  ("Build my plan →") + workspace mockup (pipeline, audience card, top
  recommendation with projected lift, channels to test — Banyan's real channels,
  honesty badge). How-it-works re-titled "From product URL to your next growth
  experiment." with the vision's 4 connected steps; old preview section retired
  (superseded by the hero mockup); nav adds Channels; CTAs say "Build my plan".
- Real wiring: hero URL → `/signup?next=/onboarding?url=…` → onboarding website
  field prefilled (BuildPlanForm.tsx; onboarding/page.tsx searchParams).
- Dashboard (`src/app/app/page.tsx`) rebuilt as the Growth workspace: goal card
  with big progress + task count; "This week's growth focus" numbered list built
  from real gates/blockers/running tasks + top recommendation; Active-experiment
  card (running · day N, hypothesis, variable, honest mid-run note); Customer
  journey funnel (visit/signup/onboarding_complete with true 14-day deltas vs
  previous window + daily sparkline — new `Sparkline.tsx`, true zeros kept);
  Publishing panel (connections + scheduled/published with real statuses);
  "Recommended next test" evidence banner (fig gradient, evidence checklist,
  limits) + remaining-recs pointer to strategy.
- New Growth strategy page (`src/app/app/strategy/`): goal & constraints chips,
  agent synthesis (plan summary + real counts + confidence), recommended growth
  bets (evidence list, disconfirmers, Create experiment), risks & assumptions
  with Validate actions, strategy-agent rail (planner/strategist/analyst tasks),
  explainability callout, opportunity→hypothesis→experiment flow. Nav: Strategy
  added to Plan group (Compass).
- Bets/risks "Create experiment"/"Validate" prefills the experiments form via
  `?title=` (experiments page + ExperimentManager prefillTitle).
- Verified: typecheck clean; 181/181 unit tests; production build green; E2E
  acceptance 42/42 against the dev server; browser-checked landing + dashboard
  (cold, goal, rich data) + strategy at 1440/390px; fixed a mobile flex-shrink
  defect on the goal card found during verification.
- scripts/seed-visual-check.js: idempotent visual-check seed (backdated
  first-party events, tracked link, scheduled/manual publications) used to
  exercise the data-rich dashboard states; dev database only, gitignored.
