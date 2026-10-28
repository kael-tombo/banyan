# Contributing to Banyan

Short, opinionated guide for changing this repo. The product's honesty rules
apply to engineering too: **every claim in a PR description should be
verifiable from the checks you ran.**

---

## 1. Setup

```bash
git clone https://github.com/kael-tombo/banyan && cd banyan
npm install
cp .env.example .env
# APP_SECRET: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run setup        # prisma migrate deploy + seed demo workspace
npm run dev          # http://localhost:3000
```

Seeded login: `founder@banyan.ai` / `banyan-demopass` (dev only).
Node 20+. See `docs/RELEASE_RUNBOOK.md` for the full env-var table.

## 2. Workflow

1. Branch from `main` (`feat/<topic>`, `fix/<topic>`, `docs/<topic>`).
2. Small, verifiable increments — one concern per commit.
3. Commit style: conventional commits (`feat:`, `fix:`, `test:`, `docs:`,
   `chore:`, `ops:`), imperative, with the "why" when non-obvious.
4. **Push every finished commit to `origin/main` promptly** — this project
   operates on a "always save and push to remote" rule; never leave finished
   work only on a local machine. Push feature branches as WIP backups too.
5. Update docs in the same change when behavior changes: README (features /
   env vars / commands), `docs/*` (architecture/data model/API/security),
   `progress.md`, and the repo `worklog.md` (chronological record).

## 3. Quality gates (all required before merge/push to main)

```bash
npm run typecheck    # tsc --noEmit — must be clean
npm test             # full Vitest suite — must be green, no weakened assertions
npm run build        # production build — must compile
```

Plus, depending on the change:

- **Schema change** → additive Prisma migration (`npm run db:migrate`),
  verified against a fresh DB (`npx prisma migrate deploy`); new statuses
  get state-machine entries in `src/lib/state-machines.ts`.
- **Behavior change** → extend unit tests; run
  `BASE_URL=http://localhost:3000 bash scripts/e2e-acceptance.sh` against a
  live server, then `npx tsx scripts/cleanup-e2e.ts`.
- **UI change** → browser check at 1440px and 390px; landing motion must
  stay reduced-motion safe.
- **New dependency** → justify it in the commit message; run `npm audit`
  (see the deferral policy in `docs/RELEASE_RUNBOOK.md` §9 — no unforced
  major upgrades in a launch window).

## 4. Engineering rules (enforced in review)

These are the project's non-negotiables — most are backed by tests:

1. **No fabricated outcomes.** Show real rows, honest zeros, or explicit
   "uncollected/not enough data" states. Never invent metrics, testimonials,
   or provider confirmations.
2. **Human approval before consequential external actions.** Publishing
   requires `approvedById` (`isExportableContent`); agent tasks require the
   approved plan; approvals are invalidated by edits.
3. **Provider confirmation or nothing.** `published` requires provider
   evidence or a human-recorded live URL; unavailable integrations are
   `blocked` with guidance, never simulated.
4. **Tenant isolation.** Every query scoped by `workspaceId`; foreign IDs
   404; `requireRole` on mutations.
5. **Secrets stay server-side.** Encrypted at rest (AES-256-GCM), `hasKey`
   over the wire, nothing in logs or client errors.
6. **Fetch user-supplied URLs only through `safeFetch`** (SSRF guard).
7. **Bodies through `readJson`** (512 KB cap + zod) on mutating routes.
8. **Idempotent side effects.** Dedupe keys on tasks, idempotency keys on
   publications, atomic claims in the orchestrator.
9. **Label the fallback.** Template/placeholder output is labelled end to
   end (`isFallback`), never presented as live model output.
10. **Provenance on facts.** Verified / user-provided / external /
    hypothesis are distinguishable in storage, prompts, and UI.

## 5. Where things live

```
src/app/            routes (landing, auth, onboarding, /app, /api, /t)
src/lib/            domain: agents/ model/ ai/ publishing/ capabilities/
                    analytics/ auth/ net/ + state-machines, learning, …
src/components/     design system (ui.tsx), app chrome, landing animation
prisma/             schema + migrations + seed
worker/             background heartbeat (tick loop)
scripts/            e2e-acceptance.sh, cleanup-e2e.ts
docs/               architecture, data model, API, testing, security,
                    launch audit/backlog, runbook, agentic runtime
tests/              Vitest unit suites (mocked externals only)
```

## 6. Docs map

| When you change… | Update |
| --- | --- |
| API routes/contracts | `docs/API.md`, README routes section |
| Schema/status machines | `docs/DATA_MODEL.md` |
| Orchestrator/agents/model/capabilities | `docs/AGENTIC_RUNTIME.md`, `docs/ARCHITECTURE.md` |
| Security-relevant controls | `docs/SECURITY.md` (+ `docs/LAUNCH_BACKLOG.md` if it changes launch posture) |
| Deploy/env/ops | `docs/RELEASE_RUNBOOK.md` |
| User-visible features | `README.md`, `progress.md`, `CHANGELOG.md` |

## 7. Reporting issues

Open a GitHub issue with: what you did, what you expected, what happened,
and the relevant trail (`ActivityEvent`, `TaskRun`, `/api/usage`). Security
issues → private security advisory only (see `docs/SECURITY.md` §4).
