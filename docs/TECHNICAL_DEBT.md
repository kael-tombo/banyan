# Technical Debt Register

> Statuses checked against the code on 2026-11-07. Open items: TD-08 (partly), TD-09, TD-10, TD-11, TD-12 (vendor), TD-14, TD-16, TD-19, and the nested zod 3 under `@opencode/sdk` noted in TD-18.

Recorded 2026-11-01 during the Phase 0 audit. Severity: **High** blocks the MVP or risks data/money · **Medium**
hurts reliability or operations · **Low** cleanup.

| ID | Debt | Severity | Impact | Fix (story) |
| --- | --- | --- | --- | --- |
| TD-01 | Rate limiter is an in-process `Map` | High | Limits reset on restart and are not shared across instances; brute-force protection weakens behind more than one replica | Redis-backed limiter (US-007) · ✅ **Resolved**: Redis-backed limiter, per-process fallback only when Redis is down (`src/lib/ratelimit.ts`) |
| TD-02 | Worker polls an HTTP tick every 60 s | Medium | Up to 60 s latency; no backpressure; no visibility of queued work | Redis job queue (US-005, US-006) · ✅ **Resolved**: Redis job queue and worker (`src/lib/queue/`); the sweep remains as a safety net |
| TD-03 | No Docker Compose | High | Environment is not reproducible; the brief's release criteria require it | US-001 – US-004 · ✅ **Resolved**: `docker-compose.yml` with migrate, web, worker, Postgres, Redis |
| TD-04 | Postiz adapter, connection UI and landing-page claims | High | Forbidden by the brief; landing page claims a publishing path that will be removed | US-028, US-029 · ✅ **Resolved**: Postiz removed; one comment in `providers.ts` forbids re-adding it |
| TD-05 | Campaign lifecycle split across four state machines | Medium | No single place answers "where is this campaign?"; brief's 12-state lifecycle not representable | US-046 · ✅ **Resolved**: one lifecycle in `src/lib/campaign/lifecycle.ts` |
| TD-06 | Product snapshot is rule-based HTML extraction | Medium | Misses features, problems solved, differentiators; no `missing_information` | US-022, US-023 |
| TD-07 | Untrusted page text enters prompts without explicit isolation | High (security) | Prompt-injection risk from crawled websites | US-024 · ✅ **Resolved**: `src/lib/ai/untrusted.ts` sanitises, flags and fences crawled text |
| TD-08 | Text `console.*` logging | Medium | Hard to search; secrets redaction not centralised | US-064 · **Mostly resolved**: redacted JSON logs in `src/lib/log.ts`; two `console.warn` calls remain (queue enqueue, rate-limit fallback) |
| TD-09 | Global npm `legacy-peer-deps=true` silently dropped `vite` | Low | Test runner failed to install | **Fixed** in this branch (explicit devDependency) |
| TD-10 | Unused landing components (`LivingTree`, `VascularTree`, `WorkflowFlow`, `branches`, `Sparkline`) | Low | Dead code, larger review surface | US-070 |
| TD-11 | About 37 uppercase-tracked labels across individual app pages | Low | Visual inconsistency after the studio redesign | US-071 |
| TD-12 | No email delivery capability | High | Blocks email verification and password recovery | US-010, US-011, US-012 · **Built, needs a vendor**: outbox, verification, recovery and digests (`src/lib/email/`); set `SMTP_URL` (blocker 06) |
| TD-13 | No funnel metric definitions | Medium | The brief's activation and time-to-value metrics cannot be reported | US-057, US-058 · ✅ **Resolved**: `src/lib/activation.ts`, `npm run report:activation` |
| TD-14 | Hydration warning `<html style>` in the Ship Studio preview | Low | Comes from the preview harness injecting a style attribute, not from app code; does not occur in a plain browser run | Monitor |
| TD-15 | `Dockerfile` uses Node 20; local dev uses Node 22 | Low | Runtime drift between dev and image | US-002 · ✅ **Resolved**: the image is `node:24-alpine`, matching CI |
| TD-16 | `.next` dev artefacts and `node_modules` live inside a OneDrive-synced folder | Low | Sync churn and disk pressure on the dev machine | Document in README (US-004) |
| TD-18 | ~~zod 3 high advisory (GHSA-mrhx-c7xc-m3w5)~~ **Resolved 2026-11-07**: Banyan moved to zod 4.6.7 (`z.record` takes its key schema; `required_error` became `error`; login looks the address up without a format check, so a stricter validator can never lock out an account) | — | One zod 3 copy remains nested under `@opencode/sdk` → `gitlab-ai-provider` (their pin; that provider is not used and validates no Banyan input) | Drop it when OpenCode updates the provider. The CI audit level stays at critical until TD-19 |
| TD-19 | postcss inside Next 15 has high advisories (source-map file reads, XSS in stringify); fix is Next 16 | Low | Build-time only, on Banyan's own CSS; no user CSS is processed | Upgrade to Next 16 with a full browser pass |
| TD-17 | `ModelCall.workspaceId` has no `onDelete: Cascade` | Medium | Deleting a workspace fails with a foreign-key error once it has any model usage (found 2026-11-01 while cleaning up a test workspace); blocks account deletion | Add cascade (or archive usage rows) with US-015 · ✅ **Resolved 2026-11-07**: `onDelete: Cascade` (migration `20261107180000_model_call_cascade`); CI deletes a workspace with usage |
