# Banyan.ai

**The Product Distribution OS for founders.**

**You build it. Banyan gets it out.** *Build. Distribute. Grow.*

> Customer-facing positioning, ICP and MVP scope are defined in
> [`STRATEGY.md`](STRATEGY.md). The technical scope below describes the broader
> loop the platform implements; the strategy defines what we launch and sell.

Banyan.ai coordinates goals, research, strategy, content, publishing and
learning into an execution system that helps founders turn a product into
measurable growth experiments. Goals are created in natural language, turned
into a structured plan, and executed by a persistent agent runtime — with
human approval before anything consequential happens. It is deliberately
**not** a content generator with a scheduler attached, and it never invents
results.

## Honesty posture

These rules are enforced in the code, not just documented:

- **No fabricated outcomes.** The dashboard and analytics show real rows or an
  explicit empty state. A real zero is shown as `0`; anything not measured is
  labelled as uncollected.
- **Human approval before external actions.** Publishing refuses any content
  without a recorded `approvedById` (`isExportableContent`), editing approved
  copy invalidates the approval, and no agent task executes before the plan
  itself is approved.
- **Provider confirmation or nothing.** A publication becomes `published` only
  after the provider confirms it, or after a human records a real live URL.
  Missing integrations are `blocked` with actionable messaging — never faked.
- **Model output is labelled.** When no model credentials are configured, drafts
  come from a local template fallback that is always displayed as such.
- **Provenance everywhere.** Business context distinguishes verified facts,
  user-provided information, external observations and generated hypotheses —
  in storage, in prompts, and in the UI.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Database | PostgreSQL via Prisma ORM (hosted, e.g. Prisma Postgres) |
| Styling | Tailwind CSS v4 |
| Validation | Zod |
| Auth | Cookie sessions (DB-backed, HMAC-hashed tokens) + bcryptjs |
| AI | Model router over OpenAI-compatible endpoints + usage ledger + quotas |
| Background jobs | BullMQ on Redis (`worker/`), HTTP tick fallback without Redis |
| Infrastructure | Docker Compose: web, worker, migrate, postgres, redis |
| Distribution | Provider-neutral `DistributionProvider`; SocialFlow.ai (not yet verifiable) + export mode |
| Capabilities | Provider-independent registry (publishing, creative, research, analytics) |
| Tests | Vitest (375 unit tests) + 43-check live E2E acceptance script |

## Quick start (Docker — recommended)

```bash
cp .env.example .env
# Set APP_SECRET (64 hex chars), WORKER_SECRET and POSTGRES_PASSWORD, e.g.:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

docker compose up -d --build   # web, worker, migrate (one-shot), postgres, redis
docker compose ps              # all healthy; migrate shows Exited (0)
docker compose logs -f         # follow logs (Ctrl-C to stop following)
docker compose down            # stop; database and queue volumes are kept
```

The app is at `http://localhost:3000` (change it with `WEB_PORT`). Migrations run
once before web and worker start. Full guide, test profile, backups and
troubleshooting: [docs/DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md).

## Quick start (without Docker)

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
# then set APP_SECRET to 32 random bytes hex:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Apply migrations and seed the demo workspace
npm run setup        # prisma migrate deploy && tsx prisma/seed.ts

# 4. Run the app
npm run dev          # http://localhost:3000
```

Sign in with the seeded account (`SEED_USER_EMAIL` / `SEED_USER_PASSWORD`, which
default to `founder@banyan.ai` / `banyan-demopass`). The seed creates Banyan.ai's
own first workspace — real product context, a starter distribution goal, one
planned campaign and one planned experiment, and **no results**.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection URL, e.g. `postgres://user:pass@host:5432/db?sslmode=require`. Aliases accepted when `DATABASE_URL` is absent: `PRISMA_DATABASE_URL`, `POSTGRES_URL` (precedence: `DATABASE_URL` > `PRISMA_DATABASE_URL` > `POSTGRES_URL`) |
| `APP_SECRET` | yes | 32 bytes hex (64 chars). Encrypts stored credentials and keys session tokens |
| `NEXT_PUBLIC_APP_URL` | yes | Public base URL; used to build tracked-link URLs |
| `AI_PROVIDER` | no | `openai` \| `none` (auto-detects from key presence) |
| `OPENAI_API_KEY` | no | Enables live generation. Without it the labelled template fallback is used |
| `OPENAI_BASE_URL` | no | Any OpenAI-compatible endpoint (default `https://api.openai.com/v1`) |
| `OPENAI_MODEL` | no | Model name (default `gpt-4o-mini`) |
| `OPENAI_EXTRA_HEADERS` | no | JSON object of extra headers for gated OpenAI-compatible gateways, e.g. `{"X-Z-AI-From":"Z","X-Token":"…"}`. Invalid JSON is ignored |
| `WORKER_SECRET` | no | Bearer secret protecting `POST /api/worker/tick` |
| `WORKER_INTERVAL_MS` | no | Maintenance sweep interval (queue mode) or tick interval (HTTP fallback); default 60000 |
| `REDIS_URL` | no (set by Compose) | Enables the BullMQ job queue. Without it the worker polls `/api/worker/tick` |
| `WORKER_CONCURRENCY` | no | Jobs processed in parallel per worker (default 4) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Compose only | Credentials for the Compose Postgres; Compose builds `DATABASE_URL` from them |
| `WEB_PORT` / `COMPOSE_APP_URL` | Compose only | Host port for web; public URL if not `http://localhost:$WEB_PORT` |
| `WORKER_BASE_URL` | no | Overrides the worker's target base URL (defaults to `NEXT_PUBLIC_APP_URL`) |
| `MODEL_MAX_CALLS_PER_DAY` | no | Per-workspace daily cap on live model calls (default 500); fallback is never quota-limited |
| `FASTLANE_API_KEY` | no | Enables the Fastlane capability adapter (short-form creative; unverified until exercised) |
| `MIGRATE_ON_BUILD` | no | `0` skips the build-time `prisma migrate deploy`; `strict` fails the build when migrations cannot be applied; default applies them and, on failure, prints a warning and continues (verify with `GET /api/health`) |
| `USER_MODEL_KEYS_ENABLED` | no | Reserved: user-provided model keys are not implemented; managed access only |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | no | Seeded demo account |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run db:migrate` | Create/apply a dev migration |
| `npm run db:deploy` | Apply committed migrations |
| `npm run db:seed` | Seed the demo workspace |
| `npm run setup` | `db:deploy` + `db:seed` |
| `npm run worker` | Run the worker in development (queue consumer with `REDIS_URL`, HTTP tick fallback without) |
| `npm run build:worker` | Bundle the worker to `dist/worker.js` (used by the Docker image) |
| `node scripts/backlog/render.mjs` | Regenerate the MVP backlog docs from `scripts/backlog/stories-*.mjs` |

## Deploying

- **Docker Compose** (single host, recommended): [docs/DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md).
- **Node host** (long-running): see `docs/RELEASE_RUNBOOK.md` §4.
- **Vercel + hosted Postgres (durable demo):** point the database URL at a
  hosted PostgreSQL (e.g. Prisma Postgres) — `DATABASE_URL`, or the
  platform-injected aliases `PRISMA_DATABASE_URL` / `POSTGRES_URL` work as-is —
  set `APP_SECRET` and `WORKER_SECRET`, and deploy. `npm run build` deploys
  pending migrations automatically — on failure it warns and continues rather
  than blocking the deploy (`MIGRATE_ON_BUILD=strict` fails the build instead,
  `MIGRATE_ON_BUILD=0` skips); provision the demo account once with
  `npm run setup` against the same database. Data
  is durable — no serverless filesystem caveat. After deploying, check
  `GET /api/health`: it reports which env names were found, whether the full
  configuration validates, and whether the database is reachable, seeded and
  serving the demo account. Details:
  `docs/RELEASE_RUNBOOK.md` §4 "Vercel alternative".

## The agentic execution runtime

The core loop is goal-driven and persists every step:

1. **Goal** — describe it in plain language (`/app/goals`). Banyan extracts the
   metric, target, deadline and constraints, and drafts a structured plan.
2. **Plan approval** — the plan shows its summary, assumptions, missing
   information and risks. Nothing consequential runs until you approve.
3. **Research → Strategy → Campaign** — hypothesis-framed, provenance-labelled,
   one message, one audience, a declared success metric.
4. **Content** — channel/format-specific drafts land in the review queue.
5. **Approval gate** — a recorded human decision closes the gate.
6. **Publish** — through SocialFlow.ai once its API is verified; today in
   export mode: you publish the approved post and record the live URL. The
   automated step is honestly **blocked** and the workflow state is preserved.
7. **Measure → Evaluate → Recommend** — real observed outcomes only
   (publications, tracked clicks, first-party events), an experiment verdict
   with limitations, and a next action that cites its evidence.

Every task has structured inputs, an assigned agent role, explicit status,
dependencies, retry budgets, verification criteria and execution records.
Crashed runs resume from persisted state without duplicating side effects.
See [`docs/AGENTIC_RUNTIME.md`](docs/AGENTIC_RUNTIME.md) for the full design,
including the Fastlane capability evaluation and the honest list of
unavailable external services.

## Architecture

A modular monolith plus one background worker — no premature microservices.

- **Experience** — `src/app` (landing, auth, onboarding, and the `/app` product)
  and `src/components` (design system in `ui.tsx`, app chrome in `AppShell.tsx`,
  shared navigation model in `app-nav.ts`, ⌘K palette in `CommandPalette.tsx`).
- **Domain / tools** — `src/lib`:
  - `agents/` — the orchestration runtime: pure graph logic (`graph.ts`),
    output verification, NL goal parsing, the workflow template, agent
    handlers (`handlers/`) and the central `orchestrator.ts`.
  - `model/` — the model router (provider resolution, quotas, usage ledger),
    deliberately separate from the agent runtime.
  - `capabilities/` — provider-independent capability registry, including the
    evaluated Fastlane adapter.
  - `ai/` — provider interface, OpenAI-compatible adapter, labelled fallback,
    structured-output validation, plan and content generation.
  - `distribution/` — the provider-neutral `DistributionProvider` interface and
    the provider registry (empty until SocialFlow.ai is verified).
  - `publishing/` — the publication lifecycle (`publish.ts`): atomic claim,
    approval re-check, bounded retry, manual recording, export package.
  - `analytics/` — tracked-link creation and click/attribution recording.
  - `state-machines.ts` — explicit campaign/content/goal/task transitions and
    the export guard.
  - `learning.ts` — evidence-based experiment summaries.
  - `auth/`, `crypto.ts`, `api-utils.ts`, `permissions.ts`, `ratelimit.ts`,
    `activity.ts`, `env.ts`.
- **Policy / execution control** — same-origin enforcement, per-route rate limits,
  server-side workspace scoping, role checks, the approval guards, and
  idempotency keys on publications and task creation.
- **Durable state** — `prisma/schema.prisma` (`Goal`, `GoalPlan`, `AgentTask`,
  `TaskRun`, `ProfileFact`, `Recommendation`, `ModelCall` alongside the
  distribution models).
- **Worker** — `worker/index.ts` polls `POST /api/worker/tick` (publications +
  workflow advancement).

### Security boundaries

- The browser never receives provider credentials; connections are stored with
  AES-256-GCM (`crypto.ts`) and only decrypted server-side.
- Every API route resolves the workspace via `requireWorkspace()` and scopes all
  queries by `workspaceId`.
- Tracked links can only redirect to `http`/`https` destinations.

## Routes

Public: `/`, `/login`, `/signup`, `/privacy`, `/terms`, `/t/[slug]` (tracked-link
redirect), `/onboarding`.

Authenticated (`/app`): dashboard, cycles, cycles/new, cycles/[goalId], goals,
goals/[id], context, workspace, audience, campaigns, campaigns/new,
campaigns/[id], content, content/new, content/[id], approvals, calendar,
publishing, analytics, experiments, settings, growth.

API: `auth/{login,logout,signup}`, `profile`, `profile/facts` (+`[id]`),
`product/intake`, `product/snapshot`, `onboarding`, `audience`, `campaigns`,
`content` (+`generate`, `review`, `schedule`, `publish`), `goals` (+`[id]`,
`plan/approve`, `advance`), `tasks/[id]` (retry/cancel/gate), `connections`,
`links`, `metrics`, `experiments`, `usage`, `worker/tick`.

## The core loop

1. **Goal & context** — onboarding/workspace capture product, audience, goal, channels, brand voice.
2. **Plan** — the AI layer drafts a hypothesis-framed plan (or a labelled template).
3. **Campaign** — one message, one audience, a declared success metric.
4. **Content** — channel/format-specific drafts, versioned; generation never overwrites edits.
5. **Approval** — a human approves a specific revision; publishing is refused without it.
6. **Publish** — through SocialFlow.ai once verified; today you publish the export and record the real URL.
7. **Measure** — tracked links record first-party visits; signups are attributed only when the visitor cookie is present.
8. **Learn** — experiments draft conclusions from recorded data (and say "not enough data" otherwise). Concluded interpretations become prompt context for the next plan, strategy and draft, so the loop compounds instead of resetting.

## The complete cycle

The unit of proof is one complete cycle, not a report about one. `/app/cycles/new`
starts from a product URL: Banyan reads one **public** page through the SSRF guard,
shows the founder exactly which fields it read, and asks them to correct the
snapshot before anything is stored. The reviewed snapshot becomes
`user_provided` business context — never a market fact.

The founder then chooses one objective, metric, target, window and two or three
channels. `/app/cycles/[goalId]` shows the seven stages (intake, strategy, three
assets, approval, publishing, measurement, next move), the plan's assumptions
and missing information, the three channel-native drafts, the recorded approval
gate, provider-confirmed publications, first-party clicks/signups, and the
next recommendation. A short-form video is scripted and labelled a **manual
handoff**; it is never counted as a live publish.

Explicit intake fields win over model extraction: the selected metric, target,
deadline and channels are stored on the goal, and the strategy handler refuses
to silently drop a channel the founder chose.

## Distribution

Banyan distributes through **SocialFlow.ai**, behind the provider-neutral
`DistributionProvider` interface (`src/lib/distribution/types.ts`). SocialFlow.ai
has no API Banyan can verify yet — its repository is a browser-only planning
release and socialflow.ai is a parked domain — so the provider registry is empty
and no automated publishing happens. Evidence, the contract Banyan needs and the
handoff for the SocialFlow.ai team: [docs/SOCIALFLOW_INTEGRATION_AUDIT.md](docs/SOCIALFLOW_INTEGRATION_AUDIT.md).

**Export mode** is the live path: every approved post has an export package
(channel-formatted copy, video script, checklist). You publish it yourself and
record the live URL, which is stored as a manual publication — never as a
provider confirmation. Postiz was removed ([ADR-003](docs/ARCHITECTURE_DECISIONS.md));
old Postiz connections are kept for the record with status `removed`.

## Brand

The visual identity uses the official [`banyan-logo-kit`](#) assets: the banyan
symbol (`public/brand/symbol-color.png`, `symbol-white.png` on canopy/dark
surfaces), the favicon set, and the 1200×630 social-share image. The design
system ("Banyan Studio", `src/app/globals.css`) takes its palette from the logo:
canopy ink `#0e2a21`, leaf green `#23523f`, warm bone paper `#f7f4ec`, and
banyan-fig gold `#b88a33` reserved for what needs a human. The marketing site is
the white, sunlit expression of the brand; the signed-in app is the working
studio — a canopy rail, a quiet contextual top bar, and a ⌘K command palette over
the shared navigation model. Auth uses the same split-screen canopy language;
the hero carries the white symbol as a quiet watermark.

## AI provider

Any OpenAI-compatible endpoint. With no key, generation uses a deterministic local
template that is always labelled — it is never presented as live model output.

## Tests

```bash
npm test        # 354 unit tests across 28 files: state machines,
                # orchestration graph, failure recovery, verification,
                # NL goal parsing, quotas, SSRF guard, body caps, env
                # guards, capabilities honesty, recommendation evidence,
                # learning memory, permissions
```

Beyond unit tests, `scripts/e2e-acceptance.sh` drives the full founder
journey (42 checks) against a live server. See [`docs/TESTING.md`](docs/TESTING.md).

## Known limitations

- **The agentic runtime executes the distribution workflow.** Goal-driven
  planning, research, strategy, campaign creation, content drafting, approval
  gates, publishing, measurement, evaluation and recommendations run with
  persisted state and bounded retries. What is *not* implemented yet: a
  durable long-running goal/plan/task-graph scheduler beyond the worker tick
  (e.g. per-task cron scheduling or human-in-the-loop multi-day pauses),
  parallel multi-campaign waves per goal, and inter-workspace agent
  delegation.
- Automated publishing is unavailable until SocialFlow.ai ships a verifiable
  API; the publish step is honestly blocked and export mode is the live path.
- The Fastlane capability adapter is implemented against Fastlane's documented
  API but is **unverified** until exercised with real credentials
  (`FASTLANE_API_KEY`). Brand analysis is not part of Fastlane's API and is
  not claimed.
- Learning memory is per workspace and reads the recorded interpretation, not
  statistical significance. An experiment completed without an interpretation
  is excluded until someone records what it meant; there is no cross-workspace
  learning.
- External research / live market data is not wired in: research briefs are
  labelled hypotheses, not collected facts.
- Object storage, notifications, usage budgets beyond the model
  call quota, and multi-user collaboration are not implemented; the rate
  limiter is in-process (single node).
- Legal pages are templates, not reviewed legal documents.

## Project documents

**Core:**

| Document | What it holds |
| --- | --- |
| [`STRATEGY.md`](STRATEGY.md) | Customer-facing category, promise, ICP, MVP scope, pricing and 30-day launch plan |
| [`vision.md`](vision.md) | Why the product exists, who it is for, milestones and non-goals |
| [`philosophy.md`](philosophy.md) | Product and engineering beliefs, and where each is enforced in code |
| [`progress.md`](progress.md) | Living status board: done, partial, not started, next up |
| [`worklog.md`](worklog.md) | Chronological record of changes |
| [`CHANGELOG.md`](CHANGELOG.md) | Release history (Keep-a-Changelog) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Dev setup, workflow, quality gates, engineering rules |

**Reference (`docs/`):**

| Document | What it holds |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design: layers, request lifecycle, agent runtime, provider boundaries, extension points |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | All 23 entities, relationships, and every state machine |
| [`docs/API.md`](docs/API.md) | Full API reference: endpoints, auth, rate limits, conventions |
| [`docs/TESTING.md`](docs/TESTING.md) | Unit suite map, E2E acceptance run, quality gates |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model, controls in code, known gaps, reporting |
| [`docs/AGENTIC_RUNTIME.md`](docs/AGENTIC_RUNTIME.md) | The execution loop, orchestrator contract, capability honesty (incl. Fastlane evaluation) |
| [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md) | Factual status report against the master build spec |
| [`docs/LAUNCH_AUDIT.md`](docs/LAUNCH_AUDIT.md) | Evidence-based launch audit (Oct 28 2026) |
| [`docs/LAUNCH_BACKLOG.md`](docs/LAUNCH_BACKLOG.md) | Frozen P0/P1/P2/P3 launch backlog with verification log |
| [`docs/RELEASE_RUNBOOK.md`](docs/RELEASE_RUNBOOK.md) | Deploy, env vars, migrations + backup, smoke tests, monitoring, rollback |
| [`docs/LAUNCH.md`](docs/LAUNCH.md) | Announcement draft, 5-minute demo script, honest limitations |
