# Banyan — Project Audit

Audit date: 2026-11-01 · Branch: `mvp/socialflow-foundation` · Auditor: Claude Code (Phase 0 of the MVP brief)

This audit is the baseline for the MVP brief ("BANYAN — God Mode"). It records what the repository
actually does today, measured, before any MVP change. Every "Working" claim below cites the test or
run that proves it. Companion documents:
[CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md) ·
[TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) ·
[MVP_GAP_ANALYSIS.md](MVP_GAP_ANALYSIS.md) ·
[SOCIALFLOW_INTEGRATION_AUDIT.md](SOCIALFLOW_INTEGRATION_AUDIT.md) ·
[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).

---

## 1. Baseline (executed, not assumed)

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npx tsc --noEmit` | **Pass**, 0 errors |
| Unit tests | `npx vitest run` | **354 / 354 pass**, 28 files, 8.1 s |
| Production build | `next build` | **Pass** (all 35 routes compiled) |
| End-to-end acceptance | `BASE_URL=… bash scripts/e2e-acceptance.sh` against a live dev server + Postgres 16 | **42 / 42 pass** |
| Database migrations | `npx prisma migrate deploy` on an empty Postgres 16 | **Pass**, 3 migrations applied |
| Seed | `npm run db:seed` | **Pass** |
| Docker image | `Dockerfile` (single-node, multi-stage) | Present; not rebuilt in this audit (see INF stories) |
| Docker Compose | — | **Missing** |

### Pre-existing failure found and fixed during the baseline

`vitest` could not start on this machine: `Cannot find package 'vite'`. Cause: the global npm config
sets `legacy-peer-deps=true`, so npm skips vitest's required peer `vite` even though the lockfile
lists it. Fix: `vite@8.3.5` (the locked version) is now an explicit devDependency, so the suite
installs the same way on every machine. No test was changed or deleted.

### E2E coverage of the baseline run

Signup · login · wrong-password rejection · onboarding (5 steps) · profile persistence · natural-language
goal → plan → human plan approval · agent-drafted content · per-item review and approval · approval
gate closed by a human · **publish without a connection blocked honestly** · manual publication with a
real URL · experiment · manual results · evidence-based recommendation with confidence · re-login and
persistence · second user · **cross-workspace goal and content access denied (404)** · oversized body
(413) · malformed JSON (400) · **SSRF to cloud metadata blocked** · logout and session invalidation.

---

## 2. Stack as found

| Area | As found | Brief's mandate | Decision |
| --- | --- | --- | --- |
| Frontend | Next.js 15 App Router, React 19, Tailwind 4 | Existing framework if viable | Keep |
| Backend | Next.js route handlers (TypeScript) + Prisma 6 | FastAPI | **Keep TypeScript** (ADR-001) |
| Database | PostgreSQL (Prisma migrations) | PostgreSQL | Keep |
| Background jobs | `worker/index.ts` polls `POST /api/worker/tick` | Celery | Redis-backed TS queue (ADR-002) |
| Broker / cache | none (in-memory rate limiter) | Redis | Add Redis |
| Infrastructure | single `Dockerfile` | Docker Compose | Add Compose |
| AI | provider-neutral `AIProvider` (OpenAI-compatible + labelled template fallback) | Provider-neutral | Keep |
| Distribution | `PublishingAdapter`: `postiz` (implemented), `manual`; `socialflow` boundary only | SocialFlow.ai only, no Postiz | SocialFlow contract + export mode; remove Postiz (ADR-003) |

---

## 3. Feature classification

Legend: **Working** = implemented and verified by a test or run above · **Partial** = exists but does not meet the brief ·
**Broken** = fails today · **Missing** = absent · **Unnecessary** = present but unused or out of scope.

### Authentication and accounts

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Registration | Working | `POST /api/auth/signup`; E2E "signup works" |
| Login / logout | Working | E2E login, wrong-credential, logout, session invalidation |
| Password hashing | Working | bcrypt cost 12 (`src/lib/auth/password.ts`) |
| Sessions | Working | random token, SHA-256 hash stored, httpOnly + SameSite=Lax cookie, server-side expiry |
| Email verification | **Missing** | no token model, no mailer |
| Password recovery | **Missing** | no reset flow |
| Login brute-force protection | Working | E2E "seeded account not brute-forceable"; rate limiter |

### Workspace and onboarding

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Workspace creation on signup | Working | signup creates workspace + owner membership |
| Workspace isolation | Working | E2E cross-workspace 404s; `requireWorkspace()` scoping |
| Roles / capabilities | Working | `src/lib/permissions.ts` (approve / write roles) |
| Onboarding wizard | **Partial** | 5 steps (product, audience, goal, channels, voice). Missing from brief: workspace details (industry, business model, time zone), brand guidelines and restrictions, distribution preferences (frequency, formats), connection step, first-campaign and activation stages |
| Save and resume progress | Working | each step persists; `onboardingCompletedAt` |
| Optional, skippable onboarding | Working | app usable before completion (AppShell banner) |

### Product intelligence

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Product URL normalisation | Working | `normalizeProductUrl` + unit tests (`product-intake.test.ts`) |
| Public page read with SSRF guard | Working | `safeFetch` (protocol, DNS, redirect, size); E2E SSRF blocked |
| Snapshot extraction (name, description, value prop) | Working | deterministic HTML extraction (`extractProductSnapshot`) |
| User review and correction of the snapshot | Working | cycle intake (`/app/cycles/new`) |
| Structured AI product analysis (features, audience, problems, differentiators, missing information) | **Partial** | snapshot is rule-based; no schema-validated model analysis with `missing_information` |
| Prompt-injection isolation of page content | **Partial** | page text is extracted, not executed; no explicit untrusted-content delimiting in prompts |

### Strategy, content and approval

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Goal → plan → human approval | Working | E2E plan drafted, awaits approval, approved |
| Agent orchestrator (tasks, leases, retries) | Working | `agentic-runtime.test.ts`, `agents-graph.test.ts` |
| Channel-specific content drafts | Working | E2E 2 drafted items; `formats.test.ts` |
| Content revisions (AI vs user-edited) | Working | `ContentRevision` model; versioned edits |
| Review → approve / reject; editing approved copy resets the gate | Working | state machine + E2E |
| Regenerate content | Working | `POST /api/content/[id]/generate` |
| Strategy reject / regenerate | Working | goal `awaiting_approval → planning` |
| Campaign lifecycle per brief (12 states) | **Partial** | campaigns have 5 states (`draft, planned, in_progress, completed, archived`); the brief's states are spread across goal, content and publication machines |
| Calendar view | Working | `/app/calendar` |

### Distribution

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Vendor-neutral `PublishingAdapter` | Working | `src/lib/publishing/types.ts` |
| Postiz publishing (X, LinkedIn) | Partial → **to remove** | implemented against Postiz's public API; not exercised live (no credentials). Forbidden by the brief (ADR-003) |
| SocialFlow.ai publishing | **Missing — blocked** | no verifiable API exists ([SOCIALFLOW_INTEGRATION_AUDIT.md](SOCIALFLOW_INTEGRATION_AUDIT.md)) |
| Manual handoff / export package | Working | `GET /api/content/[id]/handoff`; `socialflow-handoff.test.ts` |
| Manual publication record (live URL) | Working | E2E "manual publication recorded with real URL" |
| Honest blocking without a connection | Working | E2E "publish without connection blocked honestly" |
| Idempotency and duplicate-publish guard | Working | unique `Publication.idempotencyKey`, one in-flight publication per item (`publishing-retry.test.ts`) |
| Bounded retry with backoff | Working | retryable classes only, ≤ 4 attempts, capped 30 min |
| Scheduling | Partial | worker polls a tick endpoint every 60 s; no queue |

### Measurement and learning

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Tracked links + redirect `/t/[slug]` | Working | `analytics/links.ts`, unit tests |
| First-party events (visit, signup, activation) | Working | `MetricEvent` |
| Manual metric entry | Working | E2E "results recorded manually" |
| Recommendations with evidence, confidence, uncertainty | Working | E2E; `learning.test.ts` (explicit zeros) |
| Provider analytics | **Missing — blocked** | depends on SocialFlow analytics |
| Business funnel metrics (onboarding completion, time to first publication, publish success rate) | **Missing** | events exist piecemeal; no metric definitions or dashboard |

### Credits and billing

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Credit ledger, balances, reservations, refunds, expiry | **Missing** | no model |
| Model-call cost tracking and daily quota | Working | `ModelCall`, `model/quota.ts`, `/app/usage` |
| Paid purchases | Out of scope | brief: not without a configured payment provider |

### Operations and security

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Health endpoint | Working | `GET /api/health` |
| Credential encryption at rest | Working | AES-256-GCM (`crypto.test.ts`) |
| Request size and JSON validation | Working | E2E 413 / 400 |
| Rate limiting | **Partial** | in-memory `Map`; resets on restart and is per-process |
| Audit log | Working | `ActivityEvent` |
| Docker Compose (frontend, api, worker, postgres, redis) | **Missing** | |
| Redis | **Missing** | |
| Structured logging | **Partial** | `console.*` text lines |
| Notifications | **Missing** | in-app only via activity feed |

### Unnecessary (present, unused)

| File | Why |
| --- | --- |
| `src/components/landing/LivingTree.tsx`, `branches.ts` | old landing hero, no importers |
| `src/components/landing/VascularTree.tsx`, `vascularGeometry.ts` | old landing hero, no importers (geometry keeps a unit test) |
| `src/components/landing/WorkflowFlow.tsx` | no importers |
| `src/components/Sparkline.tsx` | replaced by `VisitsChart`, no importers |

Removal is tracked as tech debt, not done in this audit.

---

## 4. Headline findings

1. **The core founder journey already works end to end** (42/42 E2E), with honest blocking, an approval gate,
   idempotent publishing and workspace isolation. The MVP is an extension of a working product, not a rebuild.
2. **SocialFlow.ai, the brief's mandated distribution engine, has no API to integrate.** Your own repository
   (`ShipStudio/socialflow-ai-2`) is a browser-only planning release with an unbuildable backend, and the public
   domain is parked. This is the MVP's critical external blocker.
3. **The brief's primary activation metric cannot be achieved through SocialFlow.ai today.** Banyan will ship an
   honest export mode plus a contract-tested adapter so the switch is a configuration change once SocialFlow ships
   the API.
4. Missing MVP capabilities that are fully within Banyan's control: email verification, password recovery, the
   extended onboarding stages, schema-validated product analysis, the campaign lifecycle, the credit ledger,
   Docker Compose with Redis and a queue-backed worker, and funnel metrics.
