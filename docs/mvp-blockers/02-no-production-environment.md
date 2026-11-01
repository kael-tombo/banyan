# 02 — No production environment

## Problem

Banyan runs on a laptop under Docker Compose. There is no hosted instance, no domain, no managed database
and no place a founder can sign up.

## Evidence

- [progress.md](../../progress.md) "Next up": production hosting + domain not done.
- STRATEGY.md Appendix A: "Production deployment — **Not done**".
- No platform config in the repo; [DOCKER_DEPLOYMENT.md](../DOCKER_DEPLOYMENT.md) covers local Compose only.
- `.github/` holds only a PR template — `ci.yml` was never pushed (needed a `workflow`-scoped token).

## Why it blocks the promise

No real founder can run a cycle. LinkedIn and X OAuth (blocker 01) require a stable public HTTPS redirect URI.
Tracked links (`/t/[slug]`) must resolve on a public domain to record a single real visit.

## Decision needed (founder)

Where to host. The stack is one image with three roles (web, worker, migrate) plus Postgres and Redis, so it
needs a host that runs a long-lived worker — not a pure serverless platform.

| Option | Fit | Rough cost |
| --- | --- | --- |
| **Single VM (Hetzner/DigitalOcean) running the existing Compose file + Caddy for TLS (recommended)** | Identical to local; cheapest; one box to back up | ~$10–25/mo |
| Railway / Render / Fly | Managed Postgres + Redis, worker as a second service | ~$25–60/mo |
| Vercel + external worker | Splits web and worker; Prisma tracing workarounds already in `next.config.ts` | Most moving parts |

Recommendation: a single VM with Compose — it matches vision principle 9 (one app, one worker, one database).

## Plan, step by step

1. **Buy/point the domain** (e.g. `app.banyan.ai`) and a short tracking domain if desired.
2. **Provision the VM**; install Docker; create a non-root deploy user; firewall to 22/80/443 only.
3. **Add a production Compose override** (`docker-compose.prod.yml`): Caddy service terminating TLS and proxying
   to `web`; no host ports on Postgres/Redis; `restart: unless-stopped`; resource limits.
4. **Secrets** — `.env` on the box only (mode 600): `APP_SECRET`, `WORKER_SECRET`, `DATABASE_URL`, `REDIS_URL`,
   model key, OAuth client secrets. Env validation already fails fast in production on defaults.
5. **Push CI** — create a token with `workflow` scope (founder action) and push `.github/workflows/ci.yml`:
   typecheck, unit tests, build, and image build on every PR.
6. **Deploy script** — `scripts/deploy.sh`: pull tag → `docker compose build` → `migrate` → `up -d` → hit
   `/api/health`; roll back to previous image tag if health fails.
7. **Run the [RELEASE_RUNBOOK.md](../RELEASE_RUNBOOK.md) smoke checklist** against the public URL.
8. **Backups** — handed to blocker 10 (nightly `pg_dump` off-box) but must exist before the first real user.

## Acceptance

- `https://<domain>/api/health` returns healthy (db, redis, queue backlog) from outside.
- Signup → login works on the public URL; a `/t/<slug>` link records a visit from a phone on mobile data.
- CI runs on a PR and blocks merge on failure.
- A redeploy and a rollback have each been done once and timed.

## Dependencies

None. This is the first thing to start, in parallel with blocker 01's decision.

## Stories

US-008 (profiles) · US-068 (backups) · OPS-1 remainder.
