# Banyan — Launch Audit (Phase A, October 28 2026)

Evidence-based current-state audit for the October 31 public release.
Every finding lists its evidence (file paths, command output, or live behavior).
Statuses: **Verified** (reproduced in this audit) / **Documented** (observed in code, not re-run).

## 1. Architecture

- **Stack**: Next.js 15.5 App Router · React 19 · TypeScript strict · Prisma 6 + SQLite (`file:`) · Tailwind v4 · zod 3.25 · bcryptjs 3 · Vitest 3. No queue, no Redis, no external infra. Single-node deployment assumption (documented in README).
- **Domain layer** (`src/lib/`): `agents/` (orchestrator, pure graph, task handlers, verification), `model/` (router + daily quota ledger), `ai/` (OpenAI-compatible provider + labeled template fallback), `publishing/` (Postiz adapter, lifecycle, bounded retries), `capabilities/` (honest registry incl. `unverified` Fastlane), `auth/` (DB-backed sessions, bcrypt cost 12), `ratelimit.ts` (in-process sliding window), `crypto.ts` (AES-256-GCM secrets at rest), `permissions.ts` (owner/member/viewer), `state-machines.ts`, `learning.ts`.
- **Runtime processes**: `next start` (or dev) + optional `npm run worker` (tsx loop → `POST /api/worker/tick` with Bearer secret).
- **Persistence**: 23 Prisma models, 2 migrations (`20261027081750_init`, `20261028072735_agentic_execution_runtime`), both applied here.
- **Edge guard**: `src/middleware.ts` presence-checks the session cookie for `/app/*` + `/onboarding/*`; authoritative checks are DB lookups in server components (`requireWorkspaceServer`) and route handlers (`requireWorkspace`). API routes are not middleware-guarded and self-check — verified consistent across all route files.

## 2. Verified working capabilities

| Capability | Evidence |
|---|---|
| Typecheck, unit tests, production build | `tsc --noEmit` clean; **120/120** vitest pass; `next build` succeeds (this audit, Oct 28) |
| Auth + session | `POST /api/auth/login` 200 with seeded account; unauthenticated `/api/usage` → 401; cookie `banyan_session` HMAC-bound to `APP_SECRET`, 30-day TTL, httpOnly/sameSite=lax/secure-in-prod |
| Tenant isolation | `requireWorkspace()` + `workspaceId` scoping verified in all 20+ API routes; write/approve actions gated by `requireRole()`; connections GET returns `hasKey` only, never keys |
| Agentic loop (honest) | Goal → plan → human approval gate → research/strategy/campaign/content → approval → publish (blocks without connection) → measure (zero when unmeasured) → evaluate (`not_enough_data`) → evidence-backed recommendation. Verified end-to-end Oct 28 session; reproduced live in Phase VI re-run |
| Model routing + quota | Managed-first resolution; per-workspace daily live-call cap (`MODEL_MAX_CALLS_PER_DAY`, default 500) enforced against the `ModelCall` ledger; overflow → labeled template fallback, never a 500 |
| Rate limits | `guardRate` on login 10/min, signup 10/min, ai-generate 20/min, publish 30/min, goals-create 10/min, plan-approve/advance 30/min, task-control 30/min, links 30/min, facts 60/min |
| Publishing honesty | No connection → `blocked`; Postiz adapter verified against its public API; manual publication path (`recordManualPublication`) exists; retries bounded (4 attempts, jittered backoff) |
| Landing/marketing | Modern redesign shipped (`38acdac`); browser-verified desktop + mobile |

## 3. Findings — broken, incomplete, unverified, or risky

### P0 (launch blockers)

- **SEC-1 · SSRF via Postiz connection `baseUrl`** — *Verified.* `src/app/api/connections/route.ts` accepts any `z.string().url()`; `src/lib/publishing/postiz.ts::request` fetches it server-side with **no private-IP/protocol/redirect/size protection**, and `validateConnection` **echoes the response body back** (`res.body.slice(0,200)`, publish errors `.slice(0,300)`). Any signed-up user gets a full read primitive against `127.0.0.1`, `169.254.169.254`, RFC-1918, and cloud metadata. Public launch makes this exploitable by anyone.
- **SEC-2 · Well-known worker secret in production** — *Verified.* `src/lib/env.ts:13` defaults `WORKER_SECRET` to `banyan-worker-dev-secret`; `POST /api/worker/tick` accepts it unauthenticated (Bearer check only). An operator who skips one env var lets strangers trigger orchestrator ticks for **all** workspaces (publish retries, quota burn). Fail fast in production instead.
- **ERR-1 · No global 404 / root error boundary** — *Verified.* Only `src/app/app/error.tsx` exists. Public users hitting any unknown URL get the framework default; a render crash outside `/app` shows Next's default error. Add root `not-found.tsx` + `global-error.tsx`.

### P1 (high-value, pre-launch)

- **SEC-3 · No request body size cap** — *Verified.* `parseJson` validates already-parsed input; routes call `req.json()` directly. zod 3.25 is in the advisory list for memory exhaustion on oversized constrained collections. Uniform content-length + raw-size cap in a shared helper closes this without the risky zod 4 major upgrade.
- **SEC-4 · `session.ts` reads `process.env.APP_SECRET` directly** — *Documented.* Dead-code fallback (`"insecure-dev-secret"`) is unreachable because `session.ts` imports `env.ts` (fail-fast), but the inconsistency invites future bugs. Use `env.APP_SECRET`.
- **DEP-1 · Dependency advisories (10: 2 critical, 3 high, 5 moderate)** — *Verified via `npm audit`.* Triage: vitest/tinypool criticals are **dev/test-only** (not shipped); prisma/deepmerge-ts chain fixable safely; `zod@4` and `next@16` are **major** upgrades → deferred post-launch per mission Rule 3 (no unforced risky upgrades in the launch window), with SEC-3 mitigating the reachable zod advisory.
- **E2E-1 · Acceptance script lost** — *Verified.* `scripts/e2e-acceptance.sh` was used in the Oct 28 build session but never committed (only `scripts/cleanup-e2e.ts` is in git). Recreate as a committed, repeatable journey test against the live API.

### P2 (post-launch acceptable, documented)

- In-memory rate limiter (single-node; documented in README) — fine for MVP scale.
- No automated website scraping: onboarding stores the product URL as context (`ProductProfile.website`); research outputs are hypothesis-labeled. The mission explicitly allows manual-context fallback; live scraping stays **deferred** (avoids the SSRF class entirely for analysis).
- No CI, no container manifest, no structured logger (zero `console.*` in `src/`; observability via `ActivityEvent`/`TaskRun.log`/`ModelCall` DB trails).
- Products `SEED_USER_PASSWORD` default — seed-only; runbook instructs rotating it.

## 4. Deployment status

- **No production deployment exists yet** (no platform config in repo). README documents manual Node hosting: `npm install` → configure `.env` → `npm run setup` → `npm run build && npm start` (+ `npm run worker`). SQLite single-node.
- **Deliverable D** (`docs/RELEASE_RUNBOOK.md`) formalizes: env vars, migration procedure, deploy steps, smoke tests, monitoring, rollback.

## 5. Critical blockers → resolved in this mission

SEC-1, SEC-2, ERR-1 are implemented before launch (see `docs/LAUNCH_BACKLOG.md` for acceptance criteria and verification). SEC-3 and E2E-1 are completed as P1. Everything else is documented as a known limitation.
