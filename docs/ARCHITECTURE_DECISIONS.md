# Architecture Decision Records

Decisions taken at the start of the MVP brief, 2026-11-01. Each was confirmed by the product owner.

---

## ADR-001 — Keep the TypeScript backend instead of rewriting in FastAPI

**Status:** Accepted (product owner, 2026-11-01)

**Context.** The brief lists FastAPI + Celery as mandatory, and also says "Preserve working existing
functionality" and "Do not replace working existing functionality without justification". The repository is a
working Next.js 15 + Prisma application: 41 API routes, 25 models, an agent orchestrator, 354 passing unit tests and
a 42-check end-to-end suite.

**Decision.** Keep Next.js route handlers and Prisma as the backend. Run the same image as two Compose services
(`web` for UI + API, `worker` for jobs) so the API and the worker scale and restart independently.

**Consequences.**
- The MVP reaches a working, tested state without a multi-week rewrite of verified code.
- Python is not introduced. AI workflows stay behind the existing provider-neutral `AIProvider`.
- The brief's service list (`frontend`, `api`, `worker`, `postgres`, `redis`) maps to `web` (frontend + api in one
  Next.js process), `worker`, `postgres`, `redis`. Splitting `web` is possible later without code changes.
- Revisit if a Python-only capability (a specific ML library) becomes necessary.

## ADR-002 — Redis-backed job queue in TypeScript instead of Celery

**Status:** Accepted

**Context.** The brief mandates Redis and background jobs (Celery). ADR-001 keeps the stack TypeScript, so Celery
does not apply. The current worker polls `POST /api/worker/tick` every 60 s, and the rate limiter is an in-process
`Map` that resets on restart and is not shared across instances.

**Decision.** Add Redis to Compose. Use it for (1) a durable job queue consumed by the `worker` service (publication
attempts, status sync, analysis and generation jobs) and (2) a shared rate-limit store. Idempotency remains enforced
in Postgres (unique keys), so a lost or duplicated Redis message can never double-publish or double-charge.

**Consequences.** Postgres stays the source of truth; Redis holds only transient work and counters. The existing
retry rules in `src/lib/publishing/publish.ts` are reused, not reimplemented.

## ADR-003 — SocialFlow.ai via contract + export mode; remove Postiz

**Status:** Accepted

**Context.** The brief makes SocialFlow.ai the only distribution provider and forbids Postiz (no integration, no
fallback). The SocialFlow.ai audit ([SOCIALFLOW_INTEGRATION_AUDIT.md](SOCIALFLOW_INTEGRATION_AUDIT.md)) found no
verifiable API: the product's own repository is a browser-only release with an unbuildable backend. Postiz is
currently Banyan's only automated publishing path.

**Decision.**
1. Define the contract Banyan needs from SocialFlow.ai and implement `SocialFlowAdapter` against it, with mocked
   contract tests. Keep it disabled until a live smoke test passes against a real SocialFlow.ai deployment.
2. Make export mode (channel-formatted package → founder executes → records the live URL) the MVP's live
   distribution path, clearly labelled as manual.
3. Remove the Postiz adapter, its connection UI and every Postiz claim in the product and on the landing page.

**Consequences.**
- Banyan cannot publish automatically until SocialFlow.ai ships the contract's core operations (C1, C2, C3, C5, C7).
- The brief's primary activation metric (first publication **through SocialFlow.ai**) is measurable but will read
  zero until then. Banyan reports it honestly, alongside "first publication (any path)".
- No code outside the distribution module changes when SocialFlow.ai becomes available.
