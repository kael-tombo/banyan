# Banyan — Testing Guide

What is tested, how to run it, and what the numbers mean. Banyan's testing
philosophy: **pure domain logic in unit tests, the real workflow in a live
acceptance run** — and never weaken an assertion to get a green build.

---

## 1. Unit tests (Vitest)

```bash
npm test          # run once
npm run test:watch
```

Current state: **26 files, 331 tests — all passing** (verified 2026-10-30).
Typecheck (`npm run typecheck`) is clean; the production build (`npm run
build`) is green.

| Suite | Covers |
| --- | --- |
| `state-machines.test.ts` | Every legal/illegal transition for campaign, content, publication, goal, task, experiment statuses; the `isExportableContent` export guard (including the transient `publishing` state). |
| `goal-state.test.ts` | Goal lifecycle transitions and guards. |
| `agents-graph.test.ts` | The pure orchestration graph: dependency resolution, observer bypass (observers promoted even when a dependency ends *blocked*), failure propagation, lease expiry/requeue, bounded retries, parallel batches. **No database by design** — `graph.ts` is a pure function of task rows. |
| `agentic-runtime.test.ts` | Orchestrator behaviors around claims, dedupe keys, verification gates, progress accounting. |
| `verify.test.ts` coverage | Output verification schemas (`nonempty`, `json_schema`, `provider_confirmed`) — unknown schema names fail loudly. *(within agentic/graph suites)* |
| `nl-goal.test.ts` | Natural-language goal parsing: metric/target/deadline/constraint extraction, edge cases. |
| `ai-generate.test.ts` | Structured output validation, plan/content generation contracts, fallback labelling. |
| `publishing-retry.test.ts` | Bounded retries with jittered backoff, terminal-vs-transient classification, duplicate prevention (idempotency key). |
| `safe-fetch.test.ts` | The SSRF choke point: http(s)-only, private-IP rejection (loopback, RFC-1918, CGNAT, link-local, cloud metadata, v6 ULA/v4-mapped), redirect re-validation, size caps. |
| `read-json.test.ts` | The 512 KB body cap: content-length and raw byte-length enforcement, 413/400 behavior. |
| `env.test.ts` | Fail-fast environment validation — production rejects a missing **or dev-default** `WORKER_SECRET`; `APP_SECRET` format; build-phase exemption. |
| `crypto.test.ts` | AES-256-GCM encrypt/decrypt round-trips, tamper rejection. |
| `ratelimit.test.ts` | Sliding-window limiter behavior. |
| `formats.test.ts` | Channel/format validation for content generation. |
| `socialflow-handoff.test.ts` | The SocialFlow.ai manual handoff: package contents (copy, video extras, checklist), defensive videoExtras parsing, the required-capability contract, and registry honesty (`unavailable` + evidence). |
| `learning.test.ts` | Evidence-based experiment summaries: verdicts from recorded data, "not enough data" when thin, recommendation confidence policy (empty evidence forces `low`). |
| `learning-memory.test.ts` | The loop's memory: only complete + interpreted experiments qualify; ordering/ties/bounds; word-safe prompt lines; honest absences; the agent-context section present when learning exists and absent when none does. |
| `command-chat.test.ts` | Grounded command-center brief: true zeros, absent data named, approval/publishing language, concluded learning carried into the brief and the labelled fallback. |

External providers (Postiz, OpenAI-compatible endpoints, Fastlane) are
**always mocked** in unit tests. There are no live-provider tests in CI —
external calls require credentials this repo does not ship.

## 2. End-to-end acceptance run

`scripts/e2e-acceptance.sh` drives the **full founder journey against a live
server** through the real HTTP API: 42 checks, exit code reflects pass/fail.

```bash
# 1. start the app (dev is fine)
npm run dev            # or npm start against a production build

# 2. run the journey
BASE_URL=http://localhost:3000 bash scripts/e2e-acceptance.sh

# 3. clean the test accounts/goals it created
npx tsx scripts/cleanup-e2e.ts
```

What the 42 checks cover (last full run: **42/42 PASS**, 2026-10-28):

- signup → onboarding → profile persistence at the API level
- NL goal creation → plan draft → **plan approval gate**
- orchestrator advancement: research → strategy → campaign → content drafts
- content review flow: submit → approve every item → `approve_gate` closes
- **honest blocked publish** without a connection → manual publication with
  a real URL → recorded as published
- experiment → results entry → evaluation → evidence-backed recommendation
  (confidence `medium` with citations)
- persistence: state survives new sessions
- security: cross-workspace 404s, unauthenticated 401s, 413 oversize body,
  400 malformed body, SSRF-guarded connection baseUrls, logout clears state

⚠️ The script creates real test users/goals — **do not point it at a
production instance during live traffic**. Clean up with `cleanup-e2e.ts`
afterwards.

## 3. Quality gates (definition of "verified")

A change is considered verified only when **all** of these pass on the
changed tree:

1. `npm run typecheck` — zero errors
2. `npm test` — full suite green, no skipped/weakened assertions
3. `npm run build` — production build compiles (catches env-guard and
   RSC/prerender issues unit tests cannot)
4. `npx prisma migrate deploy` against a fresh DB (when schema changed)
5. For behavioral changes: `scripts/e2e-acceptance.sh` against a live server
6. For UI changes: browser check at desktop (1440px) and mobile (390px)

Historical note for CI parity: `npm run build` on machines **without**
secrets requires the build-phase env exemption (`NEXT_PHASE`) — the
production `WORKER_SECRET` guard is a **runtime** check, not a build-time
one (see `src/lib/env.ts` and commit `e6baf60`).

## 4. What is intentionally *not* automated

- **Live provider publishing** (Postiz with real credentials) — exercised
  manually when credentials are available; otherwise the blocked/manual
  paths are what's tested. Never claim API-path success without it.
- **Browser E2E** (Playwright et al.) — the acceptance script covers the API
  contract; UI is verified by manual/browser sessions during changes.
- **Lint** — no ESLint config in the repo yet; typecheck + strict TypeScript
  is the current bar (documented limitation, see LAUNCH_BACKLOG P3).
