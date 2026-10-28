# Banyan — Launch Backlog (frozen October 28 2026)

Prioritized, evidence-linked backlog for the October 31 release. Scope is **frozen**: P0+P1 ship, P2 is documented, P3 waits. Each P0/P1 item carries acceptance criteria and verification evidence (filled as items complete).

## P0 — Launch blockers

| ID | Item | Evidence | Effort | Acceptance criteria | Status |
|---|---|---|---|---|---|
| SEC-1 | SSRF guard for server-side fetches of user-supplied URLs (Postiz `baseUrl`) | `src/lib/publishing/postiz.ts::request` fetches user URL; bodies echoed in `validateConnection`/`publish` errors; no IP/protocol/redirect guard | S | New shared safe-fetch: http(s) only, resolves DNS and rejects loopback/RFC-1918/link-local/metadata IPs, `redirect: "manual"` with re-validated hops (≤3), response size cap, timeout. Applied to Postiz (and env-configured adapters for defense in depth). Unit tests for private-IP rejection. All existing tests pass | ☐ |
| SEC-2 | Production must not run on the default worker secret | `src/lib/env.ts` `WORKER_SECRET` default `banyan-worker-dev-secret`; `api/worker/tick` Bearer-only check | S | Env validation fails fast in `NODE_ENV=production` when `WORKER_SECRET` is unset or equals the dev default. Test added. `.env.example` and runbook updated | ☐ |
| ERR-1 | Root `not-found.tsx` + `global-error.tsx` | Only `src/app/app/error.tsx` exists; public 404/crash surfaces use framework defaults | S | Branded 404 for unknown routes; root error boundary with recovery action and honest "what happened" copy; no secrets in output. Build passes | ☐ |

## P1 — High-value before launch

| ID | Item | Evidence | Effort | Acceptance criteria | Status |
|---|---|---|---|---|---|
| SEC-3 | Uniform JSON body size cap on API mutations | `parseJson` receives parsed value; zod 3.25 memory-exhaustion advisory reachable | S | Shared `readJson(req, schema, maxBytes)` enforcing content-length and raw-length caps; adopted across mutating API routes; 413 on oversize; tests pass | ☐ |
| SEC-4 | `session.ts` uses `env.APP_SECRET`, dead fallback removed | `src/lib/auth/session.ts:12` reads `process.env` directly | XS | Single source of truth via `env.ts`; typecheck+tests pass | ☐ |
| DEP-1 | Safe `npm audit fix` subset; majors deferred with rationale | 2 critical (vitest/tinypool, dev-only), deepmerge-ts/prisma chain fixable, `next@16`/`zod@4` majors risky | S | Non-breaking fixes applied, 120 tests + build green; `vitest` 3→5 attempted in isolation and kept only if fully green; deferrals documented in runbook | ☐ |
| E2E-1 | Recreate + commit the end-to-end acceptance script | Script used Oct 28 never committed (`git log -- scripts/e2e-acceptance.sh` empty) | M | `scripts/e2e-acceptance.sh` committed; drives the full founder journey against a live server (signup → profile → goal → plan approval → tasks → content → approval → honest blocked publish → manual publication → measure → evaluate → recommend), plus failure cases (bad login, cross-workspace 401/404, oversize body 413). Exit code reflects pass/fail | ☐ |
| OPS-1 | CI workflow (typecheck + tests on push) + Dockerfile | No `.github/`, no container manifest | S | GitHub Actions runs `typecheck`, `vitest`, `build` on push/PR; Dockerfile builds and `docker run` smoke-passes locally | ☐ |

## P2 — Documented, acceptable for launch

- In-memory rate limiter (single-node limitation, README-documented).
- No live website scraping — manual product context; hypothesis-labeled research (mission-sanctioned fallback; avoids the SSRF class for analysis).
- Observability via DB trails (`ActivityEvent`, `TaskRun.log`, `ModelCall`), no external APM.
- `SEED_USER_PASSWORD` default — seed-only, rotate per runbook.

## P3 — Post-launch

- Postgres migration for multi-node scaling; Redis-backed rate limiting.
- Live website/product-URL scraping with hardened fetch pipeline.
- zod 4 + Next 16 major upgrades (tracked with upstream advisories).
- Fastlane adapter activation behind `FASTLANE_API_KEY` verification.

## Verification log

- 2026-10-28 — Phase A audit: typecheck clean · 120/120 tests · production build green · dev server healthy · login 200 · unauth 401. Backlog frozen.
