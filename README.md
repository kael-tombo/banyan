# Banyan.ai

**The Agentic Operating System for Product Distribution.**

Build. Distribute. Grow. — *Build your product. Let it find its people.*

Banyan.ai coordinates research, strategy, content, publishing and learning into a
distribution system that helps founders turn a product into measurable growth
experiments. It is deliberately **not** a content generator with a scheduler
attached, and it never invents results.

## Honesty posture

These rules are enforced in the code, not just documented:

- **No fabricated outcomes.** The dashboard and analytics show real rows or an
  explicit empty state. A real zero is shown as `0`; anything not measured is
  labelled as uncollected.
- **Human approval before external actions.** Publishing refuses any content
  without a recorded `approvedById` (`isExportableContent`), and editing approved
  copy invalidates the approval.
- **Provider confirmation or nothing.** A publication becomes `published` only
  after the provider confirms it, or after a human records a real live URL.
  Missing integrations are `blocked` with actionable messaging — never faked.
- **Model output is labelled.** When no model credentials are configured, drafts
  come from a local template fallback that is always displayed as such.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Database | SQLite via Prisma ORM |
| Styling | Tailwind CSS v4 |
| Validation | Zod |
| Auth | Cookie sessions (DB-backed, HMAC-hashed tokens) + bcryptjs |
| AI | OpenAI-compatible chat completions behind a provider interface |
| Publishing | Postiz adapter (HTTP) behind a provider-neutral interface |
| Tests | Vitest |

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
| `DATABASE_URL` | yes | Prisma SQLite URL, e.g. `file:./dev.db` |
| `APP_SECRET` | yes | 32 bytes hex (64 chars). Encrypts stored credentials and keys session tokens |
| `NEXT_PUBLIC_APP_URL` | yes | Public base URL; used to build tracked-link URLs |
| `AI_PROVIDER` | no | `openai` \| `none` (auto-detects from key presence) |
| `OPENAI_API_KEY` | no | Enables live generation. Without it the labelled template fallback is used |
| `OPENAI_BASE_URL` | no | Any OpenAI-compatible endpoint (default `https://api.openai.com/v1`) |
| `OPENAI_MODEL` | no | Model name (default `gpt-4o-mini`) |
| `WORKER_SECRET` | no | Bearer secret protecting `POST /api/worker/tick` |
| `WORKER_INTERVAL_MS` | no | How often `npm run worker` polls the tick endpoint |
| `WORKER_BASE_URL` | no | Overrides the worker's target base URL (defaults to `NEXT_PUBLIC_APP_URL`) |
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
| `npm run worker` | Run the publishing worker loop |

## Architecture

A modular monolith plus one background worker — no premature microservices.

- **Experience** — `src/app` (landing, auth, onboarding, and the `/app` product)
  and `src/components` (design system in `ui.tsx`, app chrome in `AppShell.tsx`).
- **Domain / tools** — `src/lib`:
  - `ai/` — provider interface, OpenAI-compatible adapter, labelled fallback,
    structured-output validation, plan and content generation.
  - `publishing/` — provider-neutral `PublishingAdapter` interface, the Postiz
    adapter, and the publication lifecycle (`publish.ts`).
  - `analytics/` — tracked-link creation and click/attribution recording.
  - `state-machines.ts` — explicit campaign/content transitions and the export guard.
  - `learning.ts` — evidence-based experiment summaries.
  - `auth/`, `crypto.ts`, `api-utils.ts`, `ratelimit.ts`, `activity.ts`, `env.ts`.
- **Policy / execution control** — same-origin enforcement, per-route rate limits,
  server-side workspace scoping, the approval guard, and idempotency keys on
  publications.
- **Durable state** — `prisma/schema.prisma` (see below).
- **Worker** — `worker/index.ts` polls `POST /api/worker/tick`.

### Security boundaries

- The browser never receives provider credentials; connections are stored with
  AES-256-GCM (`crypto.ts`) and only decrypted server-side.
- Every API route resolves the workspace via `requireWorkspace()` and scopes all
  queries by `workspaceId`.
- Tracked links can only redirect to `http`/`https` destinations.

## Routes

Public: `/`, `/login`, `/signup`, `/privacy`, `/terms`, `/t/[slug]` (tracked-link
redirect), `/onboarding`.

Authenticated (`/app`): dashboard, `workspace`, `audience`, `campaigns`,
`campaigns/new`, `campaigns/[id]`, `content`, `content/new`, `content/[id]`,
`approvals`, `calendar`, `publishing`, `analytics`, `experiments`, `settings`,
`growth`.

API: `auth/{login,logout,signup}`, `profile`, `onboarding`, `audience`,
`campaigns`, `content` (+`generate`, `review`, `schedule`, `publish`),
`connections`, `links`, `metrics`, `experiments`, `worker/tick`.

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

## AI provider

Any OpenAI-compatible endpoint. With no key, generation uses a deterministic local
template that is always labelled — it is never presented as live model output.

## Tests

```bash
npm test        # 32 unit tests across state machines, formats, learning,
                # crypto, rate limiting and AI output schemas
```

## Known limitations

- **Agentic orchestration runtime is not implemented.** There is no durable
  goal/plan/task-graph execution engine (`Goal`, `AgentRun`, `TaskRun` models do
  not exist). Planning and generation are single-pass AI calls with a fallback;
  the product's strength today is the reliable distribution workflow.
- Publishing has not been exercised against real Postiz credentials here.
- PostgreSQL, object storage, notifications, usage budgets and multi-user
  collaboration are not implemented; the rate limiter is in-process (single node).
- Legal pages are templates, not reviewed legal documents.

## Project documents

| Document | What it holds |
| --- | --- |
| [`vision.md`](vision.md) | Why the product exists, who it is for, milestones and non-goals |
| [`philosophy.md`](philosophy.md) | Product and engineering beliefs, and where each is enforced in code |
| [`progress.md`](progress.md) | Living status board: done, partial, not started, next up |
| [`worklog.md`](worklog.md) | Chronological record of changes |
| [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md) | Full factual status report |
