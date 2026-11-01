# 10 — Production hardening gaps

## Problem

The app is safe on a laptop. Once it holds real founders' LinkedIn and X tokens on a public server, several
basics are missing: security headers, structured logs with secret redaction, an audit trail for publishing and
credits, backups, and continuous dependency checks.

## Evidence

- `next.config.ts` sets no security headers; no CSP/HSTS/frame-ancestors.
- TD-08: text `console.*` logging, redaction not centralised; US-064 Backlog.
- US-065 (audit), US-066 (headers/CORS), US-067 (dependency checks), US-068 (backups) — all Backlog.
- `.github/workflows/` absent (see blocker 02).

## Why it blocks the promise

§12 boundary: "No external action without a recorded authorization" and "Unauthorized external action: zero".
A leaked token or an unaudited publish breaks that boundary in the worst way — under the founder's name. Losing
the database loses every approval record.

## Plan, step by step

Do these in order; each is small.

1. **US-064 — structured logs**: one `log` module (JSON lines, level, request id, workspace id); a redaction list
   (`authorization`, `cookie`, `token`, `secret`, `password`, `apiKey`, OAuth codes); replace `console.*`; a test
   that a token never appears in output.
2. **US-066 — headers**: in `next.config.ts` `headers()`: HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
   `frame-ancestors` (allow the Ship Studio preview only in dev), a CSP starting in report-only mode then
   enforced. API: same-origin only, no wildcard CORS.
3. **US-065 — audit**: every publish attempt, approval, connection change and credit movement already writes
   rows; add a single read view (`/app/activity` filter) and make sure each row has actor, revision id, provider
   response and time.
4. **US-068 — backups**: nightly `pg_dump` from the Compose host to off-box storage (S3-compatible), 14-day
   retention; a restore drill into a scratch database, timed and written into the runbook.
5. **US-067 — dependencies**: Dependabot (or `npm audit --omit=dev` in CI) failing on high/critical; the deferred
   `next@16` / `zod@4` majors tracked with a date.
6. **Rotate seed defaults**: production refuses `SEED_USER_PASSWORD` defaults (same pattern as `WORKER_SECRET`).

## Acceptance

- securityheaders.com grade A on the production domain.
- Grep of a day of production logs finds no token, cookie or password.
- A restore from last night's backup has been performed once.
- CI fails on a newly introduced high-severity advisory.

## Dependencies

Blocker 02. Must be done **before** blocker 01's live smoke stores real tokens.

## Stories

US-064, US-065, US-066, US-067, US-068.
