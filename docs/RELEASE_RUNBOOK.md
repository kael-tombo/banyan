# Banyan — Release Runbook (public launch, October 31 2026)

Operational procedure for building, deploying, smoke-testing, and recovering Banyan.
Secrets are referenced by name only — never commit or log secret values.

## 1. Build & test commands

```bash
npm ci                      # install exact dependencies
npx prisma generate         # generate the Prisma client
npx prisma migrate deploy   # apply migrations to a fresh DB (validates sequence)
npx tsc --noEmit            # typecheck
npm test                    # vitest suite (173+ tests)
npm run build               # production build
npm start                   # serve production build on :3000
npm run worker              # optional background worker (separate process)
```

CI: `.github/workflows/ci.yml` (in repo; **not yet pushed** — pushing workflow files
requires a token with `workflow` scope; see §9). It runs migrate-deploy → typecheck →
tests → build on every push/PR.

## 2. Environment variables (required at runtime)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection URL, e.g. hosted Prisma Postgres: `postgres://user:pass@host:5432/postgres?sslmode=require`. |
| `APP_SECRET` | yes | 64 hex chars (32 bytes), e.g. `openssl rand -hex 32`. Encrypts stored credentials (AES-256-GCM) and keys session cookies. **Rotating it invalidates sessions and stored connection configs.** |
| `WORKER_SECRET` | **yes in production** | Bearer secret for `POST /api/worker/tick`. The dev default is **rejected** at production runtime (fail-fast). |
| `NEXT_PUBLIC_APP_URL` | recommended | Public base URL, used for links/redirects. |
| `AI_PROVIDER` / `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | optional | Any OpenAI-compatible endpoint. Without it, generation uses the clearly labeled template fallback (honest degradation, no errors). |
| `MODEL_MAX_CALLS_PER_DAY` | optional | Per-workspace daily cap on live model calls (default 500). |
| `MIGRATE_ON_BUILD` | optional | Set `0` to skip `prisma migrate deploy` during `npm run build` (default: deploy when a real DB URL is configured). |
| `FASTLANE_API_KEY` / `FASTLANE_API_BASE_URL` | optional | Activates the Fastlane adapter (marked unverified until exercised). |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | seed only | Used by `npm run db:seed`. **Rotate the seeded password after first login in production** (or skip seeding and sign up normally). |
| `WORKER_INTERVAL_MS` / `WORKER_BASE_URL` | worker only | Worker loop tuning. |

Missing optional keys never crash the app — the affected capability reports
"honest unavailable/not configured" in the UI.

## 3. Database migrations

- PostgreSQL via Prisma. One baseline migration exists
  (`20261028120000_postgres_init`, generated with `prisma migrate diff` from
  the schema; the pre-switch SQLite migrations were replaced when the
  provider moved from SQLite to PostgreSQL on 2026-10-28).
- Apply: `npx prisma migrate deploy` (idempotent). It also runs automatically
  during `npm run build` when a real `DATABASE_URL` is configured
  (`scripts/migrate-if-configured.ts`; skip with `MIGRATE_ON_BUILD=0`), and
  at Docker container start.
- **Backup before migrating** (hosted provider): use the provider's snapshot
  facility (Prisma Postgres console) or `pg_dump`.
- Rollback: restore the snapshot/dump. No destructive migrations exist.
- First-time provisioning of a fresh database: `npx prisma migrate deploy &&
  npm run db:seed` (seed = demo founder account + self workspace; idempotent).

## 4. Deployment procedure (Node host)

1. Provision the host with Node 20.
2. `git clone https://github.com/kael-tombo/banyan && cd banyan`
3. `npm ci`
4. Create `.env` from §2 (`openssl rand -hex 32` for both secrets).
5. `npm run setup` (migrate deploy + seed) — or skip seeding for a clean instance.
6. `npm run build`
7. `npm start` (bind :3000; put a TLS-terminating proxy in front for HTTPS).
8. `WORKER_SECRET=... npm run worker` in a second process (systemd unit / separate container), or schedule `POST /api/worker/tick` externally every minute.
9. Run §6 smoke tests.

### Docker alternative

```bash
docker build -t banyan .
docker run -p 3000:3000 --env-file .env -v banyan-data:/app/db banyan
# worker: docker run --env-file .env -v banyan-data:/app/db banyan npm run worker
```

Note: the Docker build has not been executed in this environment (no docker
daemon) — treat the first `docker build` as part of deployment validation.

### Vercel alternative (serverless + hosted Postgres)

`npm run build` succeeds on Vercel even with zero project env vars
configured: during the build phase (`NEXT_PHASE=phase-production-build`) the
env validator fills required values with inert placeholders, and no
build-time code path queries the database. Verified on a clean-room clone
(2026-10-28): fresh `npm ci` → `next build` compiles and collects page data
without secrets.

For a **working, durable** deployment, set in the Vercel project settings:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | hosted PostgreSQL URL, e.g. Prisma Postgres: `postgres://…@db.prisma.io:5432/postgres?sslmode=require`. The platform-injected aliases `PRISMA_DATABASE_URL` / `POSTGRES_URL` are accepted as-is (precedence: `DATABASE_URL` > `PRISMA_DATABASE_URL` > `POSTGRES_URL`) |
| `APP_SECRET` | `openssl rand -hex 32` |
| `WORKER_SECRET` | strong unique value (runtime fail-fast rejects the dev default) |
| `NEXT_PUBLIC_APP_URL` | the deployed URL, e.g. `https://banyan.vercel.app` (optional; defaults to localhost) |

Because the database is hosted (not a serverless file), data is **durable**
across cold starts and instances — the SQLite-on-serverless ephemerality
limitation no longer applies.

Deployment mechanics:

- **Migrations**: `npm run build` runs `prisma migrate deploy` automatically
  against the configured hosted database (`scripts/migrate-if-configured.ts`,
  idempotent; skip with `MIGRATE_ON_BUILD=0` and migrate out-of-band).
- **Demo account (one-time)**: provision the seeded founder account against
  the same database once, from any machine with the URL:
  `DATABASE_URL=<url> npm run db:seed`. The seed is idempotent but it clears
  and recreates the demo workspace's seeded content — do not wire it into
  every build if the demo workspace holds real usage. Alternatively sign up
  a real account in the UI and skip seeding entirely.
- **Serverless runtime note**: every serverless instance opens its own
  connections; Prisma Postgres provides serverless-friendly pooling. The
  in-process rate limiter and worker remain single-node concerns (run the
  worker elsewhere or tick `/api/worker/tick` externally, §4 step 8).
- **Post-deploy check**: open `https://<deployment>/api/health`. A healthy
  deployment returns 200 with `env.validated: true` and
  `db.demoUserPresent: true`; anything else names the exact gap (missing env
  name, invalid `APP_SECRET`, unreachable database, schema not migrated).
  The endpoint exposes booleans and labels only — never secret values.

## 5. First public settings

- Sign up the real admin account, change/remove the seeded founder account if seeded.
- Publishing: connect Postiz per channel in **Publishing → Connections** (baseUrl must be a **public** https host — private/internal addresses are rejected by the SSRF guard).
- Optional: set `OPENAI_API_KEY` for live model generation (falls back to labeled templates otherwise).

## 6. Smoke-test checklist (post-deploy)

1. `GET /` → 200 (landing renders).
2. `GET /login` → 200; wrong password → 401; unauthenticated `/api/goals` → 401.
3. Sign up a fresh account → onboarding wizard completes → dashboard renders.
4. Create a goal from natural language → plan appears → approve it.
5. Content drafts appear after a few seconds (advance runs on tick/UI) → submit → approve.
6. Publish without a connection → **honest blocked** message; record a manual publication with a real URL → recorded.
7. `POST /api/worker/tick` with the production bearer → 200; without → 401.
8. Or simply run the full suite: `BASE_URL=https://<prod-host> bash scripts/e2e-acceptance.sh` (42 checks; creates + cleans test users — do not point it at production during real traffic, it creates test accounts).

## 7. Monitoring & troubleshooting

- **No external APM by design (v1).** Observability lives in the DB:
  - `ActivityEvent` — user-visible workspace activity trail.
  - `TaskRun` — per agent-task execution records incl. errors (`TaskRun.log`).
  - `ModelCall` — every model call (provider, tokens, est. cost, latency, fallback label).
  - `Publication.providerResponse` — raw provider responses for audit.
- Process logs: `next` stdout (request errors), worker stdout (tick counts).
- Common failures:
  - **Invalid env at boot** — env.ts fails fast with the exact offending variable; fix `.env` and restart.
  - **Publish stuck "blocked"** — expected without a connection; connect Postiz or record manually.
  - **Generation labeled "template fallback"** — no AI key configured or quota exhausted (`MODEL_MAX_CALLS_PER_DAY`); check `/api/usage`.

## 8. Rollback / recovery

- **App**: previous image/build + previous `.next` — redeploy previous tag/commit; migrations so far are additive so old code runs on the new schema.
- **DB**: restore the §3 backup.
- **Secrets compromised**: rotate `APP_SECRET` (invalidates sessions + stored connection keys — re-enter Postiz keys), rotate `WORKER_SECRET`, restart.

## 9. Known operational gaps (accepted for launch)

- CI workflow file exists but is **not pushed** (GitHub requires `workflow` scope on the PAT; the file is ready in the working tree for the next authorized push).
- Docker image not yet built/verified end-to-end (no daemon in the build sandbox).
- Single-node app only (in-process rate limiter). Redis-backed rate limiting and multi-node scaling are post-launch (P3).
- No live website scraping in v1 — product context is user-provided (removes the SSRF class from analysis entirely); scraping is P3 with a hardened fetch pipeline required.
- Dependabot advisories remaining after remediation (5): `next@16`/`postcss` build-time chain and `zod@4` — both are major upgrades deliberately deferred; the reachable zod path is closed by the API-wide 512 KB body cap.
