# Banyan — System Architecture

How Banyan is put together: the layers, the request/runtime flow, the agent
orchestration design, and the boundaries that keep vendor code and secrets out
of the wrong places. For operational procedure see
[`RELEASE_RUNBOOK.md`](RELEASE_RUNBOOK.md); for the agent runtime's behavioral
contract see [`AGENTIC_RUNTIME.md`](AGENTIC_RUNTIME.md); for entities and
state machines see [`DATA_MODEL.md`](DATA_MODEL.md).

---

## 1. Shape of the system

A **modular monolith plus one optional background worker**. No queues, no
Redis, no microservices — deliberate for the single-node MVP scale.

```
┌────────────────────────────────────────────────────────────────┐
│ Browser                                                        │
│  landing (public) · auth · onboarding · /app product UI        │
└──────────────┬─────────────────────────────────────────────────┘
               │ https (session cookie; same-origin enforced)
┌──────────────▼─────────────────────────────────────────────────┐
│ Next.js 15 app (single Node process)                           │
│                                                                │
│  src/app          routes: pages + /api route handlers          │
│  src/middleware   cheap cookie presence check for /app/*       │
│                                                                │
│  ┌──────────────── Policy / control plane ───────────────────┐ │
│  │ requireWorkspace() · requireRole() · guardRate()          │ │
│  │ readJson() body caps · same-origin checks                 │ │
│  │ state-machines.ts transitions · isExportableContent guard │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────── Domain / tools ───────────────────────┐ │
│  │ agents/    orchestrator + pure graph + handlers + verify  │ │
│  │ model/     model router, quotas, usage ledger             │ │
│  │ ai/        provider interface, OpenAI adapter, fallback   │ │
│  │ publishing/ PublishingAdapter · Postiz adapter · retry    │ │
│  │ capabilities/ provider-independent capability registry    │ │
│  │ analytics/ tracked links, first-party events              │ │
│  │ learning.ts · activity.ts · formats.ts · net/safe-fetch   │ │
│  │ auth/ · crypto.ts · env.ts · workspace.ts · permissions   │ │
│  └───────────────────────────────────────────────────────────┘ │
└──────────────┬─────────────────────────┬───────────────────────┘
               │                         │
    ┌──────────▼──────────┐   ┌──────────▼─────────────────────┐
    │ PostgreSQL (Prisma) │   │ External providers (server-side │
    │ 23 models           │   │ only, via safe-fetch):          │
    │ hosted (e.g. Prisma │   │ · OpenAI-compatible model API   │
    │ Postgres)           │   │ · Postiz (publishing)           │
    └──────────┬──────────┘   │ · Fastlane (optional, creative)│
               │              └────────────────────────────────┘
    ┌──────────▼──────────┐
    │ worker/index.ts     │
    │ tsx loop → Bearer   │
    │ POST /api/worker/tick│
    └─────────────────────┘
```

### Processes

| Process | Command | Role |
| --- | --- | --- |
| App server | `npm run dev` / `npm start` | All pages and API routes; owns the database. |
| Worker | `npm run worker` | Loops on an interval, calls `POST /api/worker/tick` with the `WORKER_SECRET` bearer. Triggers publication due-dates and agent workflow advancement. Optional in dev, recommended in production. |

The worker holds **no domain logic** — it is a dumb heartbeat. All decisions
happen inside the app process, so the same code path serves UI-triggered and
time-triggered advancement. This keeps crash recovery, idempotency and
authorization in exactly one place.

---

## 2. Request lifecycle

Every mutating API request passes through the same gauntlet
(`src/lib/api-utils.ts`):

1. **Same-origin** — `assertSameOrigin()` rejects cross-site browser calls.
2. **Rate limit** — `guardRate(bucket, n, window)` (in-process sliding window;
   single-node constraint documented in README).
3. **Body cap** — `readJson(req, schema)` enforces content-length and raw
   byte-length caps (512 KB) **before** parsing, then validates with zod.
4. **Authentication + tenancy** — `requireWorkspace()` resolves the session
   cookie to a DB session → user → workspace membership; returns the
   membership context or 401/403. All queries scope by `workspaceId`.
5. **Authorization** — `requireRole(role, "read" | "write" | "approve" |
   "control")` gates mutations; viewers are read-only.
6. **Domain rules** — state-machine transitions and approval guards
   (`isExportableContent`) run before any persistence or side effect.

Non-browser callers: `POST /api/worker/tick` (Bearer `WORKER_SECRET`),
`/t/[slug]` (public redirect; records first-party clicks).

---

## 3. The agent runtime

The runtime turns a natural-language goal into executed, audited work. Its
design constraints: **persist everything, verify outputs, never act without a
human where it matters, never duplicate side effects.**

### 3.1 Workflow template

`src/lib/agents/workflow-template.ts` expands an approved plan into a DAG of
`AgentTask` rows. Each task carries a stable `dedupeKey`
(`goal:<id>:<slot>`), so re-running the template after crashes or repeated
ticks is idempotent — a unique constraint turns "create again" into
"find existing".

Canonical shape (11 task types across 6 agent roles):

```
plan_draft(planner) → [human plan approval]
  research(researcher)
    strategy(strategist) → campaign_plan(strategist)   [creates Campaign]
      content_draft(creator) × channels → approval_gate(publisher) [human]
        publish(publisher) → Postiz or manual record; blocked if unconfigured
      measure(analyst) → evaluate(analyst) → recommend(analyst)
```

Observers (`measure`, `evaluate`, `recommend`) depend on `publish` but are
promoted even when it ends **blocked** — their job is to report recorded
reality, including after an unavailable integration.

### 3.2 Orchestrator

`src/lib/agents/orchestrator.ts` advances all workflows on every tick:

- **Atomic claims** — a task is claimed with a status-guarded
  `updateMany` (status transition acts as the lock). Two concurrent ticks
  cannot both run the same task.
- **Leases** — a running task holds a 5-minute `leasedUntil`. Expired leases
  are requeued and recorded; handlers adopt prior partial work from stored
  outputs (dedupe keys make adoption safe).
- **Dependency resolution** — pending tasks promote when dependencies
  complete; non-observers are blocked by failed/cancelled dependencies with
  the reason recorded.
- **Bounded retries** — transient failures requeue automatically up to
  `maxAttempts` (default 3); permanent failures wait for an explicit user
  retry (`POST /api/tasks/[id]`).
- **Verification before completion** — every handler output must satisfy the
  task's declared criteria (`verify.ts`: `nonempty`, `json_schema`,
  `provider_confirmed`). Unknown schema names fail loudly.
- **Progress accounting** — goal progress = share of non-cancelled tasks
  completed, recomputed after each tick.

The pure graph logic (`graph.ts`) has **no database imports** — dependency
resolution, lease expiry, observer bypass and failure propagation are unit
tested as pure functions.

### 3.3 Handlers

`src/lib/agents/handlers/` implement each task type against the domain
layer. Handlers never call providers directly: generation goes through
`src/lib/ai`, publishing through `src/lib/publishing`. Handler outputs are
structured JSON, stored on the task (`output`) and its runs (`TaskRun`).

---

## 4. Provider boundaries

Vendor code never leaks into workflow logic. Three independent seams:

### Model router (`src/lib/model/router.ts`)

Single boundary between workflows and LLM providers.

- **Managed access first** — the deployment's OpenAI-compatible credentials
  serve every workspace; workspaces never see or supply keys (user-supplied
  keys are an explicitly disabled future feature, `USER_MODEL_KEYS_ENABLED`).
- **Quota** — live calls counted per workspace per UTC day against
  `MODEL_MAX_CALLS_PER_DAY` (default 500) using the `ModelCall` ledger.
  Overflow → labelled template fallback, never an error.
- **Usage ledger** — every call (live, fallback, failed) records provider,
  model, tokens, latency, and estimated cost in micro-USD. Costs are zero
  when pricing is unknown — never guessed. Inspect via `GET /api/usage`.
- **Fallback labelling** — template output carries `isFallback: true` end to
  end; the UI always shows it as template output.

### Publishing adapter (`src/lib/publishing/`)

`PublishingAdapter` is the provider-neutral interface
(`validateConnection`, `publish`, `checkStatus`). Implementations:
`postiz.ts` (X + LinkedIn). The lifecycle (`publish.ts`) owns state
transitions, the active-publication check, idempotency keys
(`Publication.idempotencyKey` unique), and bounded retries with jittered
backoff (`retry.ts` — 4 attempts). A `socialflow` adapter slot exists in the
capability registry, unimplemented until its API is verified. Manual
recording (`recordManualPublication`) is a first-class path, not a hack.

### Capability registry (`src/lib/capabilities/`)

Adapters describe themselves and report honest per-workspace health:
`available` | `needs_credentials` | `unverified` | `unavailable`.
Registered: `postiz` (available), `managed-model` (available), `fastlane`
(creative/schedule/analytics; implemented against the documented API,
`unverified` until exercised with `FASTLANE_API_KEY`), `web-research`
(`unavailable` — no verified provider; research tasks produce
hypothesis-labelled briefs instead of invented facts).

### Server-side fetch discipline (`src/lib/net/safe-fetch.ts`)

The one choke point for fetching user-supplied URLs (Postiz `baseUrl`):
http(s) only; DNS resolution with rejection of loopback, RFC-1918, CGNAT,
link-local, cloud-metadata and v6 ULA/v4-mapped addresses; manual redirect
handling (≤3 hops, each re-validated); response size cap. See
[`SECURITY.md`](SECURITY.md).

---

## 5. Data & persistence

Prisma + PostgreSQL, 23 models, 1 baseline migration. Full entity
reference: [`DATA_MODEL.md`](DATA_MODEL.md). Design rules:

- **Portable enums** — statuses are validated strings (carried over from the
  SQLite era by design); the validation
  lives in `src/lib/state-machines.ts` and zod schemas, so the string values
  in the DB always pass through one transition table.
- **JSON-in-TEXT columns** are used for genuinely schemaless payloads
  (generation meta, provider responses, task inputs/outputs). Anything that
  needs querying or integrity is a real column.
- **Auditability over denormalization** — `TaskRun` (per-attempt records with
  logs), `Publication.providerResponse` (raw provider payloads),
  `ModelCall` (usage ledger), `ActivityEvent` (user-visible trail) trade a
  little storage for a complete reconstruction of "what happened and why".

---

## 6. Experience layer

- `src/app` — App Router: marketing (`page.tsx`, `privacy`, `terms`),
  auth (`login`, `signup`), `onboarding`, the `/app` product (dashboard,
  goals, context, workspace, audience, campaigns, content, approvals,
  calendar, publishing, analytics, experiments, settings, growth), and
  root `not-found.tsx` / `global-error.tsx`.
- `src/components` — design system primitives (`ui.tsx`), app chrome
  (`AppShell.tsx`, `SiteNav.tsx`), auth form, and the landing animation
  system (`landing/BanyanTree.tsx`, `landing/WorkflowFlow.tsx`). Landing
  uses Inter (via `next/font`) with a glass/gradient modern layer scoped by
  `.landing` in `globals.css`; the app interior keeps the canopy design
  system. All landing motion is reduced-motion safe.
- `src/middleware.ts` — cookie **presence** check for `/app/*` and
  `/onboarding/*` (cheap redirect); the authoritative session/membership
  check happens in server components (`requireWorkspaceServer`) and route
  handlers.

---

## 7. Extension points

| To add… | Do this | Do **not** |
| --- | --- | --- |
| A model provider | One resolver entry in `src/lib/model/router.ts` | Touch workflow/handler code |
| A publishing provider | Implement `PublishingAdapter`, register in the capability registry | Bypass `publish.ts` lifecycle or the approval guard |
| An external capability | Add an adapter in `src/lib/capabilities/` with honest health reporting | Claim availability without verification |
| An agent task type | Handler + verification schema + workflow-template slot + dedupe key | Ad-hoc side effects outside a task |
| A new table | Prisma migration (additive), matching `state-machines.ts` entries | Untyped status strings without a transition table |

---

## 8. Known architectural limits (documented, accepted for v1)

- Single node: in-process rate limiter + worker on the same host.
  Redis-backed rate limiting is the P3 scaling path.
- No durable scheduler beyond the worker tick (per-task cron, multi-day
  human-in-the-loop pauses), no parallel multi-campaign waves per goal, no
  cross-workspace delegation.
- No live website scraping in v1 (product context is user-provided — removes
  the SSRF class from analysis entirely; scraping is P3 behind safe-fetch).
- No external APM; observability lives in the DB trails (`ActivityEvent`,
  `TaskRun.log`, `ModelCall`, `Publication.providerResponse`).
