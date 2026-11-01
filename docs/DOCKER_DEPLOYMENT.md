# Docker Deployment

How to run Banyan with Docker Compose (US-001 – US-004). Everything below was executed on 2026-11-01 against
Docker Desktop 4 / Compose v2 on Windows; results are recorded in [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md).

## 1. Services

| Service | Image | Role | Host port | Health |
| --- | --- | --- | --- | --- |
| `web` | `banyan-app:local` | Next.js UI + API (`next start`) | `${WEB_PORT:-3000}` | `GET /api/health` (env valid, database reachable, Redis reachable when configured; reports queue backlog) |
| `worker` | `banyan-app:local` | BullMQ consumer: publication attempts + maintenance sweep (`node dist/worker.js`) | none | process running; restarted on exit |
| `migrate` | `banyan-app:local` | One-shot `prisma migrate deploy`; web and worker wait for it to succeed | none | exits 0 |
| `postgres` | `postgres:16-alpine` | Source of truth | none (internal only) | `pg_isready` |
| `redis` | `redis:7-alpine` | Job queue (append-only file, survives restarts) | none (internal only) | `redis-cli ping` |

The brief lists `frontend` and `api` separately; in Banyan they are one Next.js process (`web`), see
[ADR-001](ARCHITECTURE_DECISIONS.md). One image serves all three app roles.

**Image:** multi-stage `node:22-alpine`, runs as the non-root `node` user (uid 1000), production dependencies only,
282 MB. Image `HEALTHCHECK` calls `/api/health`.

## 2. First run

```bash
cp .env.example .env
```

Set at least:

| Variable | How |
| --- | --- |
| `APP_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `WORKER_SECRET` | any long random string (required in production) |
| `POSTGRES_PASSWORD` | any long random string |
| `WEB_PORT` | optional; default `3000` |

Compose builds `DATABASE_URL` and `REDIS_URL` itself. The `DATABASE_URL` in `.env` is only for running outside Docker.

```bash
docker compose up -d --build
docker compose ps
```

Expected: `postgres` and `redis` healthy, `migrate` `Exited (0)`, `web` healthy, `worker` up. Open
`http://localhost:${WEB_PORT}`.

To create the demo account: `npm run db:seed` from the host with `DATABASE_URL` pointing at the Compose database is
not possible (Postgres is internal-only by design), so sign up in the UI, or run the seed inside the network:
`docker compose run --rm migrate node_modules/.bin/prisma db seed` *(requires the seed's `tsx`; tracked in US-008)*.

## 3. Everyday commands

```bash
docker compose up -d --build     # build and (re)start everything
docker compose ps                # status and health
docker compose logs -f           # all logs; add a service name to filter (e.g. worker)
docker compose restart worker    # restart one service
docker compose down              # stop and remove containers; volumes are KEPT
```

`docker compose down -v` **deletes the database and the queue**. Never use `-v` on an environment with data you want.

## 4. Tests

| What | Command |
| --- | --- |
| Unit tests (host) | `npm test` |
| Type check (host) | `npm run typecheck` |
| End-to-end against the running stack | `BASE_URL=http://localhost:${WEB_PORT} bash scripts/e2e-acceptance.sh` |

The production image deliberately contains no test files or dev dependencies, so tests do not run inside `web`. An
isolated `test` profile with its own database is planned in US-008.

**Verified 2026-11-01:** E2E 42/42 against the Compose stack; a post scheduled 20 s ahead was attempted by the worker
229 ms after it was due, from the queue rather than the 60 s sweep; data survived `down` + `up`; a worker that
received SIGTERM shut down gracefully and was restarted by Compose.

## 5. Background jobs

- Scheduling a publication enqueues a delayed `publication.attempt` job for its due time.
- Every `WORKER_INTERVAL_MS` (default 60 s) a `maintenance.sweep` job attempts anything due that the queue missed and
  advances agent workflows. The schedule lives in Redis, so several workers still sweep once per interval.
- Postgres is the source of truth: a publication is claimed with one conditional update, so a job and the sweep can
  never both deliver it, and a stale job for a cancelled or rescheduled post does nothing.
- Failed jobs are kept 30 days in BullMQ's failed set (the dead-letter record):
  `docker compose exec redis redis-cli zrange bull:banyan:failed 0 -1`.

## 6. Backups

Until the backup scripts land (US-068):

```bash
# Back up
docker compose exec -T postgres pg_dump -U banyan -d banyan -Fc > banyan-$(date +%Y%m%d-%H%M).dump
# Restore into the running stack (replaces existing objects)
docker compose exec -T postgres pg_restore -U banyan -d banyan --clean --if-exists < banyan-YYYYMMDD-HHMM.dump
```

## 7. Upgrading

```bash
git pull
docker compose up -d --build
```

`migrate` applies new migrations before the new `web` and `worker` start. If a migration fails, `web` and `worker` do
not start; read `docker compose logs migrate`.

## 8. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `ports are not available … 3000` | Another program uses the port. Set `WEB_PORT` (for example `3100`) in `.env`. The public URL follows it automatically |
| `migrate` exits 1 with `P1000: Authentication failed` | The Postgres volume was initialised with a different password. Use the original password, or (only if the data is disposable) `docker compose down -v` |
| A non-Compose Postgres container breaks after `compose up` | Never point two Postgres containers at one volume. The Compose volumes are project-scoped (`banyan_pgdata`); do not give them a global `name:`. Alpine and Debian Postgres images use different uids and will rewrite each other's file ownership |
| `web` unhealthy | `curl localhost:${WEB_PORT}/api/health` shows which check fails (env validation or database) |
| Scheduled post not attempted | `docker compose logs worker`; check `mode":"queue"` at start. Without Redis the worker falls back to the HTTP tick |

## 9. Production notes

- Put `web` behind TLS (a reverse proxy or a platform load balancer); set `COMPOSE_APP_URL` to the public URL.
- Keep `postgres` and `redis` off the host network (default).
- Production profile with resource limits and no source mounts: US-008.
