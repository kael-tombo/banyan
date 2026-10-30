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

## 2026-10-28 — Vision gaps closed: agent team, activity feed, Connections page

Second pass over the three reference screenshots, this time auditing for what
was still missing rather than re-doing what shipped in the previous commit.
Gap analysis found four gaps; all closed.

- New **Connections page** (`src/app/app/connections/`, nav group "System"):
  Growth loop setup (N-of-5 real slots: product profile, context & audience,
  publishing, link tracking, experiment loop — each slot's status is a recorded
  state with a per-slot fix CTA, manual recording called out as the honest
  publishing fallback); Data flow pipeline (approved asset → published →
  tracked visit → attributed signup → activation → experiment learning) with
  real 14-day counts and flowing/stalled/not_started health where "stalled"
  means upstream activity but zero local events; Your connections list
  (status/adapter/last-checked/last-error) + Data quality panel (connection
  errors, configured-but-unverified, signups missing campaign source, blocked
  agent tasks, recent publication failures — recorded issues only); Access &
  data use trust section (AES-256-GCM credentials, minimal permissions, user
  control, workspace boundaries, server-side approval gates).
- Dashboard: **Agent team panel** — six real agent roles (planner, researcher,
  strategist, creator, publisher, analyst) with live status derived from the
  AgentTask audit trail (working / awaiting your review / blocked / queued /
  idle / no runs yet), latest action verbatim, relative time, deep link to the
  goal; **Recent activity feed** — the ActivityEvent table finally rendered
  (actor You/System/Agent, timeAgo, evidence links resolved from recorded meta
  keys contentItemId/experimentId/campaignId/goalId/publicationId/connectionId/
  taskId/planId/factId); **Attribution coverage** — share of 14-day signups
  traceable to a tracked source, with the not-enough-data state instead of a
  fabricated percentage and an unattributed-signups hint linking to the
  Connections page.
- New shared lib `src/lib/growth-loop.ts` (pure, unit-tested): computeLoopSetup,
  computeDataFlow, attributionCoverage, resolveActivityEvidence, timeAgo,
  computeAgentTeam + AGENT_META. 19 new tests (200 total).
- Nav: "System" group with Connections (matches the reference IA where
  connections is system-level).
- Verified: typecheck clean; 200/200 unit tests; production build green; E2E
  acceptance 42/42; browser-checked dashboard + Connections + landing at
  1440/390px including the data-rich seeded workspace (loop 3/5 connected,
  stalled learning step detected correctly, agent roles with awaiting/queued
  statuses, activity evidence links).

## 2026-10-29 — Vascular hero: the tree you can watch thinking

**`feat(landing): the Living Vascular Tree — a hero where information is
always moving`** — the hero rebuilt around a living banyan whose vascular
system is visible, per the GOD-TIER design brief. The tree remains a tree:
bark, tissue, foliage, aerial roots — what is new is the transport system
inside it, and the fact that it never stops moving.

- **`src/components/landing/vascularGeometry.ts`** — a seeded, deterministic
  procedural banyan as a transport graph: trunk corridor, three tiers of
  branches (lower reach wide, crown arches), secondary forks and twigs
  (endpoints), underground roots + rootlets (the intake interface), and
  aerial roots dropped to the ground line ("new ground"). Every edge carries
  arc-length tables, width taper, and parent/child topology. Unit-tested
  invariants in `tests/vascular-network.test.ts`: determinism, exact child
  anchors on parents, monotone arc tables, outward taper, frame bounds, and
  the full banyan inventory (16 tests).
- **`src/components/landing/VascularTree.tsx`** — zero-dependency Canvas 2D
  engine. Static layer (bark with rim light, translucent tissue, vascular
  channels, foliage, atmosphere, soil) pre-rendered once per size; per frame
  only the moving elements draw (≤ ~140 sprites, no per-frame React state).
  Phases run concurrently and continuously: root intake → trunk transport
  (slow light bands beneath the bark) → branch propagation → endpoint
  activation (heat + expanding ring) → return flows. Outbound particles are
  solid green; return flows are hollow fig-gold rings — measured results
  travel valid connected paths back to the trunk and down into the roots.
  Lifecycle: pauses off-viewport (IntersectionObserver) and on hidden tabs,
  ResizeObserver + rAF-debounced resize, DPR capped at 2, density adapts to
  viewport size / hardwareConcurrency / deviceMemory, per-edge occupancy
  caps keep the canopy from ever glowing everywhere at once, and
  `prefers-reduced-motion` renders a stable static composition with the
  flows frozen as light.
- **Hero restructure** (`src/app/page.tsx` + `globals.css`): dark botanical
  night stage (`.hero-night`) — left narrative (Intelligence in motion
  badge, line-rise headline with dark-stage shimmer, "Build your network" →
  /signup, "Explore how it works" → #how-it-works, integrity trust row),
  right the vascular tree with a two-flow legend and an explicit
  "Illustrative visualization … not live data" caption. The Surfaces marquee
  restyled as the ground under the tree at night. The LivingTree and its
  chain legend moved into "How it works" (S2) — the five-phase loop is the
  explanation; the vascular tree is the feeling. S3's "tree above" copy
  still holds.
- Verified: typecheck clean; **291/291 tests** (275 existing + 16 geometry);
  production build green; browser-verified at 1440×900 and 390×844 (hero,
  marquee band, S2 tree) with no console errors; canvas exposes
  `role="img"` + descriptive aria-label. Composition is stable across
  reloads (seed 8).

## 2026-10-29 — Command center chat: the conversation at the center

The `/app` dashboard (the command center) now opens with a real, persisted
conversation with the Banyan agent — not a simulated one. The project rule
"no simulated chat" is enforced structurally: every reply is grounded in
workspace records at send time, and every assistant message carries the label
of what generated it.

- **Grounding** (`src/lib/agents/chat.ts`, pure + unit-tested):
  `buildWorkspaceBrief` assembles a records-only brief (product profile, goal
  in motion with progress, approval-gate queue, agent task states, publishing
  connections with the publish-vs-copy-ready distinction, 14-day first-party
  funnel numbers with true zeros). `chatSystemPrompt` encodes the philosophy
  as rules — never estimate or invent numbers, propose-don't-publish, name the
  unmeasured, end with one concrete next action on a named surface.
  `fallbackChatReply` builds an honest chat-shaped template reply (records +
  pointers, explicitly "not generated copy") for deployments without live
  model credentials. `flattenChatPayload` bounds the model window to the last
  12 turns.
- **Persistence** (`ChatMessage` model + migration
  `20261029100000_command_chat`): one thread per workspace; assistant rows
  store `modelLabel`, `isFallback`, `latencyMs` so the UI can always show what
  generated a reply.
- **API** (`/api/chat` GET/POST/DELETE): same-origin + `guardRate` (15/min
  send, 3/min clear) + role gates (viewer read-only), zod-validated 1..2000
  char messages, the user message persisted before the model call so the
  transcript stays truthful, replies routed through the model router
  (`purpose: "chat"`, counted against the per-workspace daily live-call
  quota, ledger row per call).
- **UI** (`src/components/CommandChat.tsx`): placed as the first section of
  the dashboard — the conversation literally at the center, above the goal
  trunk. Suggestion chips when empty, optimistic user bubble with
  server-reconciliation, `role="log"` + `aria-live="polite"`, Enter sends /
  Shift+Enter newlines, 2000-char cap, and the honesty label rendered under
  every assistant reply (fallback replies say "not generated copy").
- **Provider boundary extension** (`src/lib/ai/provider.ts` +
  `src/lib/env.ts`): `OPENAI_EXTRA_HEADERS` (JSON object) merges optional
  headers into OpenAI-compatible requests — managed gateways that require
  routing/auth headers beyond the bearer token (e.g. `{"X-Z-AI-From":"Z",
  "X-Token":"…"}`) now work through the existing provider with zero vendor
  coupling. Invalid JSON is ignored (forgiving, falls back by design).
- **Sandbox preview runtime** (not committed): no postgres exists in this
  environment, so the preview runs on SQLite via a derived schema copy
  (`provider = "sqlite"`, must live inside the package root for `prisma
  generate` to target the right client) + `db push`; the committed schema and
  migrations stay PostgreSQL-canonical. The managed model gateway is wired
  through `AI_PROVIDER=openai` + `OPENAI_EXTRA_HEADERS` in `.env`.
- Verified: typecheck clean; **313/313 tests** (291 prior + 22 chat tests);
  production build green; live end-to-end via curl and browser — login →
  dashboard → suggestion chip → grounded reply labeled `Live model: glm-4.6`
  (~1.5s), multi-turn context honored (true zeros echoed back), history
  persisted, ledger rows recorded (`promptTokens`/`completionTokens`/
  `latencyMs`), DELETE clears the thread.

## 2026-10-30 — Learning memory: the loop compounds

The loop recorded conclusions and then forgot them: `handleEvaluate` wrote an
`Experiment`, but the next plan, strategy and content draft read only
`ProfileFact` rows, so a founder's hard-won experiment result never influenced
the next campaign. The product claimed continuous improvement; the code did
one-shot learning. This closes that gap without duplicating the learning into
a second table.

- **`src/lib/learning-memory.ts` (new, pure)** — the memory rules. An
  experiment is reusable only when it is `complete` **and** has a recorded
  interpretation; a completed experiment without one is a data point, not
  learning. Newest decision first (id tie-break), bounded to six, prompt lines
  bounded and cut at word boundaries. Missing limits/next actions are named as
  missing; nothing upgrades an inconclusive result into proof.
- **Prompts read the Experiment table at call time** (`loadBusinessContext` in
  `src/lib/agents/handlers/common.ts`). `contextBlock` now renders a
  "Prior learning from concluded experiments" section labelled as recorded
  conclusions, not proof. Plan draft, research, strategy and (via the new
  optional `learning` field in `generateContent`) channel drafts all receive
  it; the manual `/api/content/[id]/generate` route does too.
- **Chat grounding** — `ChatBriefInput.recentLearnings` is built from the same
  helper. The command center can now answer "what did we learn from the last
  experiment?" from records, and the labelled template fallback surfaces the
  latest conclusion when no model is available.
- **Visible memory** — `/app/context` gained a "Learning memory" card: each
  reusable conclusion with its variable, metric, interpretation, limits and
  next action, plus an honest empty state and the rule that a conclusionless
  experiment is not memory. No new table or migration: correcting an
  experiment changes what the next plan reads.
- **Tests** — `tests/learning-memory.test.ts` (16): qualification, ordering,
  ties, bounds, word-safe truncation, honest absences, UI shape, and the
  agent-context injection/omission. Chat fixtures extended for the new brief
  field (2 new chat assertions). **331/331 tests**, typecheck clean.
- **Verified live** — created an experiment, drafted conclusions from recorded
  data (honest "not enough evidence", 0 clicks), saw it appear in the context
  memory card, and asked the command chat: the reply quoted the concluded
  experiment and its limits. Production build green.
- Known limitation, stated rather than hidden: memory is **per workspace** and
  reflects the recorded interpretation, not statistical significance. An
  experiment marked complete without conclusions stays out until someone
  records what it meant.
