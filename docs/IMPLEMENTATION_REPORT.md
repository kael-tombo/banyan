# Banyan.ai — Implementation Report

Factual status of the repository after this work session. Written against the
master build specification. **Nothing here is aspirational** — items are marked
complete, partial, or unimplemented, and validation results are the actual output.

---

## A. Repository assessment

- **Original stack:** Next.js 15 (App Router) + React 19 + TypeScript, Prisma +
  SQLite, Tailwind CSS v4, Zod, bcryptjs. Vitest was declared in `scripts` but had
  no tests.
- **State found:** a substantial, mid-build MVP. The domain layer, API routes and
  most pages existed, but the project **did not compile** — 39 TypeScript errors —
  and there were no tests, no README, no seed script and no worker entry point.
- **Key constraints discovered and respected:** SQLite (no native enums — statuses
  are validated strings), single-node deployment (in-process rate limiter),
  Postiz AGPL-3.0 (integrated over HTTP as a calling service, not embedded).

## B. Delivered functionality

### Complete

- **Compiles and builds.** All 39 pre-existing type errors fixed; `tsc --noEmit`
  and `next build` both pass (28 routes).
- **Styling fixed.** The root layout (`src/app/layout.tsx`) never imported `globals.css`, so Tailwind and the design tokens were absent on **every** page — the whole app rendered as unstyled text. It is now imported and verified: the theme applies in dev (ivory body, forest buttons, 6px inputs) and the production build emits the CSS asset.
- **Request-body handling fixed.** `parseJson` was being called with an already
  parsed body while trying `req.json()`, so every POST/PATCH endpoint would have
  thrown at runtime. It now validates the parsed body with correct output-type
  inference, and the two auth routes were updated.
- **Tracked-link loop restored.** `trackedLinkUrl()` pointed at `/t/[slug]`, which
  did not exist, and `recordClick()` was never called. Added the redirect route:
  it records the click, sets the visitor cookie for attribution, and only follows
  `http`/`https` destinations.
- **Seed script** (`prisma/seed.ts`) so `npm run setup` works, creating the demo
  founder and Banyan.ai's own self-distribution workspace (real context, one
  campaign, one experiment, no fabricated results).
- **Worker entry point** (`worker/index.ts`) so `npm run worker` works; verified
  reaching `POST /api/worker/tick` with HTTP 200.
- **Missing authenticated pages implemented** (all previously dead links):
  `/app/approvals`, `/app/calendar`, `/app/publishing`, `/app/analytics`,
  `/app/experiments`, `/app/settings`, `/app/growth`, and `/app/content/new`.
- **Unit tests** — 32 passing across state machines, format validation, experiment
  summaries, secret encryption, rate limiting and AI output schemas.
- **Documentation** — this report and the root `README.md`.

### Partial

- **Publishing** — adapter, lifecycle, idempotency, approval guard and blocked
  states are implemented and correct by code reading, but no live Postiz
  credentials were available, so end-to-end external publishing is **unverified**.
- **Analytics** — first-party visits/clicks/signups and manual metrics are real;
  provider engagement metrics are only stored when an adapter reports them
  (Postiz reports none today).

### Unimplemented (see §I)

Durable agent task orchestration, learning-record persistence, notifications,
usage/budget enforcement, PostgreSQL, multi-user collaboration, E2E tests.

## C. Architecture

- **Experience:** `src/app` + `src/components` (design system in `ui.tsx`, chrome in `AppShell.tsx`).
- **Tools/domain:** `src/lib/ai/*` (provider interface, OpenAI-compatible adapter,
  labelled fallback, structured output), `src/lib/publishing/*` (provider-neutral
  interface + Postiz adapter + lifecycle), `src/lib/analytics/*`, `state-machines.ts`,
  `learning.ts`, `auth/*`, `crypto.ts`, `api-utils.ts`, `ratelimit.ts`, `activity.ts`, `env.ts`.
- **Policy/control:** server-side workspace scoping (`requireWorkspace`),
  same-origin checks, per-route rate limits, the approval export guard, publication
  idempotency keys, AES-256-GCM credential encryption.
- **Persistence:** Prisma/SQLite (`prisma/schema.prisma`).
- **Model providers:** single `AIProvider` interface; OpenAI-compatible
  implementation; a deterministic, always-labelled template fallback.
- **Publishing adapters:** `PublishingAdapter` interface; Postiz implementation.
- **Security boundaries:** browser never sees provider secrets; all queries
  workspace-scoped; tracked-link redirects protocol-restricted.

## D. Routes and interface

Public: `/`, `/login`, `/signup`, `/privacy`, `/terms`, `/onboarding`, `/t/[slug]`.
Authenticated `/app`: dashboard, workspace, audience, campaigns (+ new, detail),
content (+ new, detail), approvals, calendar, publishing, analytics, experiments,
settings, growth. API: auth, profile, onboarding, audience, campaigns, content
(+ generate/review/schedule/publish), connections, links, metrics, experiments,
worker/tick.

## E. Database

- One committed migration: `20261027081750_init`.
- Entities: User, Session, Workspace, Membership, ProductProfile, AudienceInsight,
  Campaign, ContentItem, ContentRevision, ChannelConnection, Publication,
  TrackedLink, CampaignMetric, MetricEvent, Experiment, ActivityEvent.
- **Seed data added:** demo user, Banyan.ai workspace (self), product profile,
  3 audience hypotheses (source `assumption`), 1 planned campaign, 1 planned
  experiment, activity events. No metrics, clicks or publications are seeded.

## F. Integrations

| Provider | Capabilities | Config | Tested with real credentials | Limitations |
| --- | --- | --- | --- | --- |
| Postiz | Validate connection, publish now/schedule to X + LinkedIn, status check | Base URL, API key, per-channel integration IDs (`/app/publishing`) | **No** | No engagement metrics via public API; short-form video is manual |
| OpenAI-compatible (any) | Structured generation for plan + content | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | **No** | Falls back to a labelled local template when unset |

## G. Validation results

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npm run typecheck` | **Pass** (0 errors, was 39) |
| Unit tests | `npm test` | **Pass** — 32 tests / 6 files |
| Production build | `npm run build` | **Pass** — 28 routes compiled & prerendered |
| Migrations + seed | `npm run setup` | **Pass** — 1 migration, seed succeeded |
| Runtime smoke | `curl` against `next dev` | **Pass** — see below |
| Worker | `npm run worker` (against live server) | **Pass** — `POST /api/worker/tick` → 200 |
| Lint | — | **Not run** — no ESLint config present |
| E2E suite | — | **Not run** — none exists |

Runtime smoke test (dev server): `/`, `/login`, `/signup`, `/terms`, `/privacy`
→ 200; `/app`, `/app/approvals`, `/app/settings`, `/onboarding` without a session
→ 307 to `/login?next=…`; `/t/<unknown>` → 307 to `/`; login `POST /api/auth/login`
→ 200 with session cookie; all 13 authenticated `/app` pages → 200; tracked link
create → visit `/t/<slug>` → 307 with UTM target + visitor cookie → click recorded
(`clicks:1`). No errors or warnings in the server log.

## H. Setup

Runtime: Node.js 20+ (repo developed on modern Node with Next 15 / Prisma 6).
Commands: `npm install` → `cp .env.example .env` (set `APP_SECRET`) → `npm run
setup` → `npm run dev`. Optional: `npm run worker`. Required variables and the full
list are in `README.md` and `.env.example` (no real secrets are committed).

## I. Known limitations

1. **No agentic orchestration runtime.** The spec's planner/task-graph/recovery
   layer (Goal, AgentRun, TaskRun, ToolExecution) does not exist. Planning and
   generation are single-pass AI calls with a fallback. This is the largest gap
   between the spec and the implementation.
2. **Real external publishing is unverified** — no Postiz credentials were
   available; only the disconnected/blocked paths and the adapter logic were reviewed.
3. **Learning records** are stored as free-text fields on `Experiment`; there is no
   separate provenance-bearing `LearningRecord` entity.
4. **Infrastructure** is single-node SQLite with an in-process rate limiter; no
   PostgreSQL, object storage, notifications or usage-budget enforcement.
5. Tests are unit-level only; no integration/E2E coverage of the API or the
   publish/reconcile path.
6. Legal pages are placeholder-quality drafts, not reviewed legal text.

## J. Next three improvements

1. **Prove one real publishing path end to end** with a Postiz account: connect,
   approve, schedule, publish, and confirm the stored provider response and
   reconciliation — closing limitation §I.2 with evidence.
2. **Add API integration tests** (workspace isolation, approval enforcement,
   idempotency, tracked-link attribution) against a temporary SQLite database — the
   highest-value coverage gap given how much of the value is server-side.
3. **Implement a minimal durable task runtime** (persisted plan + task rows with
   states, retries and an approval pause) so orchestration is real rather than
   single-pass — the spec's P1 milestone.
