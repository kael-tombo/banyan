# Banyan.ai

**The Agentic Operating System for Product Distribution.**

Build. Distribute. Grow. — *Build your product. Let it find its people.*

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
| Publishing | Postiz adapter (HTTP) behind a provider-neutral interface |
| Capabilities | Provider-independent registry (publishing, creative, research, analytics) |
| Tests | Vitest (200 unit tests) + 42-check live E2E acceptance script |

## Quick start

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
| `WORKER_SECRET` | no | Bearer secret protecting `POST /api/worker/tick` |
| `WORKER_INTERVAL_MS` | no | How often `npm run worker` polls the tick endpoint |
| `WORKER_BASE_URL` | no | Overrides the worker's target base URL (defaults to `NEXT_PUBLIC_APP_URL`) |
| `MODEL_MAX_CALLS_PER_DAY` | no | Per-workspace daily cap on live model calls (default 500); fallback is never quota-limited |
| `FASTLANE_API_KEY` | no | Enables the Fastlane capability adapter (short-form creative; unverified until exercised) |
| `MIGRATE_ON_BUILD` | no | Set `0` to skip `prisma migrate deploy` during `npm run build` (default: deploy when a real database URL is configured) |
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
| `npm run worker` | Run the worker loop (publishes due content AND advances agent workflows) |

## Deploying

- **Node host / Docker** (long-running): see `docs/RELEASE_RUNBOOK.md` §4.
- **Vercel + hosted Postgres (durable demo):** point the database URL at a
  hosted PostgreSQL (e.g. Prisma Postgres) — `DATABASE_URL`, or the
  platform-injected aliases `PRISMA_DATABASE_URL` / `POSTGRES_URL` work as-is —
  set `APP_SECRET` and `WORKER_SECRET`, and deploy. `npm run build` deploys
  pending migrations automatically (skip with `MIGRATE_ON_BUILD=0`); provision
  the demo account once with `npm run setup` against the same database. Data
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
6. **Publish** — via a configured Postiz integration, or recorded manually
   with the live URL. Without a connection the task is honestly **blocked**
   with setup guidance and the workflow state is preserved.
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
  and `src/components` (design system in `ui.tsx`, app chrome in `AppShell.tsx`).
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
  - `publishing/` — provider-neutral `PublishingAdapter` interface, the Postiz
    adapter, and the publication lifecycle (`publish.ts`).
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

Authenticated (`/app`): dashboard, goals, goals/[id], context, workspace,
audience, campaigns, campaigns/new, campaigns/[id], content, content/new,
content/[id], approvals, calendar, publishing, analytics, experiments,
settings, growth.

API: `auth/{login,logout,signup}`, `profile`, `profile/facts` (+`[id]`),
`onboarding`, `audience`, `campaigns`, `content` (+`generate`, `review`,
`schedule`, `publish`), `goals` (+`[id]`, `plan/approve`, `advance`),
`tasks/[id]` (retry/cancel/gate), `connections`, `links`, `metrics`,
`experiments`, `usage`, `worker/tick`.

## The core loop

1. **Goal & context** — onboarding/workspace capture product, audience, goal, channels, brand voice.
2. **Plan** — the AI layer drafts a hypothesis-framed plan (or a labelled template).
3. **Campaign** — one message, one audience, a declared success metric.
4. **Content** — channel/format-specific drafts, versioned; generation never overwrites edits.
5. **Approval** — a human approves a specific revision; publishing is refused without it.
6. **Publish** — via a connected Postiz integration, or recorded manually with a real URL.
7. **Measure** — tracked links record first-party visits; signups are attributed only when the visitor cookie is present.
8. **Learn** — experiments draft conclusions from recorded data (and say "not enough data" otherwise).

## Publishing integration

The only implemented provider is **Postiz**, through a provider-neutral interface
(`src/lib/publishing/types.ts`). It publishes to X and LinkedIn; short-form video
is script-only by design. Channel connections are added in `/app/publishing` and
verified by calling the provider. Without credentials the whole workflow still
works up to publication, which is recorded as `blocked`.

Connector status in `/app/publishing`: **Postiz — available now**; **SocialFlow.ai
— no verifiable API exists (socialflow.ai is a parked domain, checked October
2026), so no client was built; the SocialFlow.ai *handoff* on each content item
exports a channel-formatted, copy-ready package for manual execution, and the
live URL is recorded as a user-confirmed manual publication — activation
checklist in [`docs/SOCIALFLOW_INTEGRATION.md`](docs/SOCIALFLOW_INTEGRATION.md)**;
**manual recording — always available** (publish natively yourself, record the
live URL as a user-confirmed manual publication).

## Brand

The visual identity uses the official [`banyan-logo-kit`](#) assets: the banyan
symbol (`public/brand/symbol-color.png`, `symbol-white.png` on canopy/dark
surfaces), the favicon set, and the 1200×630 social-share image. The design
system ("rooted canopy", `src/app/globals.css`) takes its palette from the logo:
deep canopy ink `#123028`, leaf green `#23523f`, cool lichen paper `#e9ede3`,
and banyan-fig gold `#b98c35` reserved for accents. Auth screens use a
split-screen canopy layout; the hero carries the white symbol as a quiet
watermark.

## AI provider

Any OpenAI-compatible endpoint. With no key, generation uses a deterministic local
template that is always labelled — it is never presented as live model output.

## Tests

```bash
npm test        # 200 unit tests across 16 files: state machines,
                # orchestration graph, failure recovery, verification,
                # NL goal parsing, quotas, SSRF guard, body caps, env
                # guards, capabilities honesty, recommendation evidence,
                # permissions
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
- Publishing has not been exercised against real Postiz credentials here;
  without a connection the publish step is honestly blocked.
- The Fastlane capability adapter is implemented against Fastlane's documented
  API but is **unverified** until exercised with real credentials
  (`FASTLANE_API_KEY`). Brand analysis is not part of Fastlane's API and is
  not claimed.
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
