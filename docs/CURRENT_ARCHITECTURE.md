# Current Architecture (as of 2026-11-01)

What exists today, measured. For the intended target, see [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md);
for the longer-form design notes written earlier, see [ARCHITECTURE.md](ARCHITECTURE.md) and
[AGENTIC_RUNTIME.md](AGENTIC_RUNTIME.md).

## 1. Shape

A **modular monolith** in one Next.js 15 application, plus a thin worker process.

```
Browser ──► Next.js (App Router)
             ├─ /            marketing site (server components, CSS-only motion)
             ├─ /app/*       authenticated studio (28 pages)
             ├─ /api/*       41 route handlers (JSON, zod-validated)
             └─ middleware   auth redirect for /app
                 │
                 ▼
             src/lib/*       domain modules (below)
                 │
                 ▼
             Prisma 6 ──► PostgreSQL 16

worker/index.ts ──HTTP──► POST /api/worker/tick   (every 60 s, Bearer WORKER_SECRET)
```

## 2. Domain modules (`src/lib`)

| Module | Responsibility |
| --- | --- |
| `auth/` | bcrypt password hashing; session creation, hashing and cookie handling |
| `workspace.ts`, `permissions.ts` | resolve the caller's workspace; role capabilities (`approve`, `write`) |
| `product/intake.ts`, `product-brief.ts` | normalise a product URL; extract a snapshot from public HTML |
| `net/safe-fetch.ts` | SSRF-safe outbound HTTP (protocol, DNS rebinding, redirect, size limits) |
| `agents/` | orchestrator, task graph, workflow template, handlers (planning, analysis, distribution), natural-language goals, command chat |
| `ai/` | `AIProvider` interface: OpenAI-compatible provider + labelled `template-fallback` |
| `model/` | model router and per-workspace daily quota; `ModelCall` cost and token log |
| `state-machines.ts` | explicit transitions for campaign, content, goal, task |
| `campaign-pipeline.ts`, `formats.ts`, `video-script.ts` | channel formats and content assembly |
| `publishing/` | `PublishingAdapter` contract; `postiz`, `manual`; `socialflow` boundary + handoff; idempotent publish with bounded retry |
| `capabilities/` | registry of external capabilities and their honest status |
| `analytics/` | tracked links, first-party events |
| `learning.ts`, `learning-memory.ts`, `results.ts`, `growth-loop.ts` | evidence evaluation, recommendations, confidence |
| `crypto.ts` | AES-256-GCM for stored credentials |
| `ratelimit.ts` | in-memory token buckets |
| `activity.ts` | audit events |
| `env.ts` | zod-validated environment (fails fast on missing `DATABASE_URL`, `APP_SECRET`) |

## 3. Data model (25 Prisma models)

Identity: `User`, `Session`, `Workspace`, `Membership`.
Product: `ProductProfile`, `AudienceInsight`, `ProfileFact`.
Planning: `Goal`, `GoalPlan`, `AgentTask`, `TaskRun`, `Recommendation`.
Content: `Campaign`, `ContentItem`, `ContentRevision`, `Experiment`.
Distribution: `ChannelConnection` (encrypted config), `Publication` (unique `idempotencyKey`).
Measurement: `TrackedLink`, `MetricEvent`, `CampaignMetric`.
Operations: `ActivityEvent`, `ModelCall`, `ChatMessage`.

Full field reference: [DATA_MODEL.md](DATA_MODEL.md).

## 4. Key flows

**Founder cycle.** URL intake → reviewed snapshot → goal (natural language) → planner drafts plan → human approves
plan → agents draft channel content → human reviews and approves each item → publish (provider or manual) →
tracked links record visits and signups → analyst evaluates → recommendation with confidence.

**Publishing.** `publish.ts` checks approval on every attempt, writes a `Publication` with a unique idempotency key,
calls the adapter, and only marks `published` on provider confirmation or a user-recorded URL. Retries only on
explicitly retryable classes (429, 5xx, timeout, network), at most 4 attempts with jittered backoff.

**Jobs.** The worker is an HTTP client: it calls the tick endpoint, and all publishing rules run server-side, so the
worker cannot drift from them.

## 5. Deployment as found

- One multi-stage `Dockerfile` (Node 20 Alpine). The runtime runs `prisma migrate deploy && npm start`. The worker
  runs from the same image with `npm run worker`.
- No Docker Compose, no Redis. `.env.example` documents required and optional variables.
- Verified locally against Postgres 16 in Docker (`banyan-postgres` container).
