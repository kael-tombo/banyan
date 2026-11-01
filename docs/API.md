# Banyan — API Reference

All endpoints under `/api`. Unless stated otherwise every route:

- authenticates via the `banyan_session` cookie and resolves the caller's
  workspace with `requireWorkspace()` (401 without a session; 403 without the
  required role capability);
- scopes every query by `workspaceId` (cross-tenant IDs resolve to 404);
- enforces same-origin on mutating verbs (browser CSRF protection);
- validates bodies with zod through `readJson`, which caps request bodies at
  **512 KB** (413 on oversize, 400 on malformed JSON or schema violation);
- returns JSON; errors are `{ error: string }` with an appropriate status.

Role capability levels (`src/lib/permissions.ts`): `read` (all members),
`write` (owner+member), `approve` (owner+member), `control` (owner+member).
Viewers are read-only everywhere.

Rate limits below are per IP, in-process (single node).

---

## Auth

| Method & path | Body | Notes |
| --- | --- | --- |
| `POST /api/auth/signup` | `{email, password, name}` | 10/min. Creates user + personal workspace + owner membership; sets session cookie. Returns `{ok, next}`. |
| `POST /api/auth/login` | `{email, password}` | 10/min. bcrypt verify; sets session cookie. 401 on bad credentials. |
| `POST /api/auth/logout` | — | Clears the session row and cookie. |

## Onboarding & profile

| Method & path | Body | Notes |
| --- | --- | --- |
| `POST /api/onboarding` | Product/audience/goal/brand-voice steps (all validated, minimum required fields) | Writes `ProductProfile` + starter `ProfileFact`s and audience insights; marks `onboardingCompletedAt`; records activity. |
| `GET /api/onboarding` | — | Generates a **draft plan preview** from the saved profile (`generateDraftPlan`). 409 if the profile is incomplete. |
| `GET /api/profile` | — | Product profile + workspace summary. |
| `PATCH /api/profile` | Partial profile fields | Updates product context. |
| `POST /api/profile` | Analysis request | Re-runs profile analysis from stored context (never fetches arbitrary URLs — see SECURITY.md). |
| `GET /api/profile/facts` | — | Business-context facts with provenance labels. |
| `POST /api/profile/facts` | `{category, key, value, provenance?, source?}` | 60/min. Upsert fact. |
| `PATCH /api/profile/facts/[id]` | `{value?, provenance?}` | 60/min. User corrections reset verification. |
| `DELETE /api/profile/facts/[id]` | — | 60/min. Removes a fact. |

## Product intake

| Method & path | Body | Notes |
| --- | --- | --- |
| `POST /api/product/intake` | `{url}` | 8/min, `write`. Normalizes a bare domain to https, fetches exactly one public HTML page through the SSRF-safe fetcher (protocol/DNS/redirect/size guards), and returns `{snapshot, sourceUrl, fetchedAt, truncated}`. Reads title, Open Graph, meta description and h1 only; never invents problem, audience or positioning. No persistence. |
| `POST /api/product/snapshot` | `{name, description, website?, stage, problem, valueProp, audience, audiencePain?, audienceOutcome?, sourceUrl?, channels?}` | 20/min, `write`. Saves the founder-reviewed `ProductProfile` and upserts `ProfileFact` rows with `user_provided` provenance. The founder's corrections are not observations from the page. |

## Goals & the agent runtime

| Method & path | Body | Notes |
| --- | --- | --- |
| `GET /api/goals` | — | Goals with plan/tasks/recommendations summary. |
| `POST /api/goals` | `{rawInput, description?, successMetric?, metricTarget?, deadlineDays?, channels?[]}` | 10/min, `write`. NL is parsed heuristically (`nl-goal.ts`) into metric/target/deadline/constraints; explicit intake fields win over extraction and the selected channels are appended as a `channels:` constraint. Creates `Goal` (status `planning`) + draft `GoalPlan` via the model router (labelled fallback without a key). |
| `GET /api/goals/[id]` | — | Goal detail: plan, tasks (+runs), campaigns, recommendations. |
| `PATCH /api/goals/[id]` | `{objective?, deadline?, constraints?, status?…}` | `write`; status changes go through the goal state machine (pause/resume/cancel). |
| `POST /api/goals/[id]/plan/approve` | `{decision: "approve"\|"reject", reason?}` | 30/min, `approve`. Records the human plan decision (`approvedById`). Approve promotes the task tree; reject returns the goal to drafting. |
| `POST /api/goals/[id]/advance` | — | 30/min, `control`. Runs one orchestrator tick for this workspace (dependency promotion, lease recovery, bounded retries, verification, progress recompute). The UI calls this automatically; the worker also calls the tick endpoint. |
| `POST /api/tasks/[id]` | `{action: "retry"} \| {action: "cancel"} \| {action: "approve_gate"}` | 30/min, `control`. `retry` requeues a failed/permanently-failed task; `cancel` stops it; `approve_gate` completes an `approval_gate` task **after** the underlying content was approved in the content UI (the explicit human action that closes the gate). |

## Content & campaigns

| Method & path | Body | Notes |
| --- | --- | --- |
| `GET /api/content` | query filters (status, campaign, channel, search) | Paginated list. |
| `POST /api/content` | `{title?, channel, format, campaignId?, …}` | `write`. Creates a draft item. |
| `GET /api/content/[id]` | — | Item + revisions + publications. |
| `GET /api/content/[id]/handoff` | — | SocialFlow.ai manual handoff: channel-formatted, copy-ready package (`{handoff, text, approved, itemStatus}`). Read-only — publishes nothing, calls no provider; the live URL is recorded afterwards via publish `mode: "manual"`. |
| `PATCH /api/content/[id]` | `{title?, body?, …}` | `write`. Saves a new `ContentRevision`; editing an approved item resets it to `draft` (approval invalidated). |
| `POST /api/content/[id]/generate` | `{note?}` | 20/min, `write`. Generates channel/format-specific copy via the model router; creates a revision (`authorType: ai`, labelled fallback when no key). Never overwrites user edits. |
| `POST /api/content/[id]/review` | `{action: "submit"} \| {action: "approve"} \| {action: "reject", reason} \| {action: "back_to_draft"}` | `approve` for approve/reject (records `approvedById`); `submit`/`back_to_draft` are `write`. Reject requires a 3–500 char reason. |
| `POST /api/content/[id]/schedule` | `{scheduledFor}` | `write`. Sets the due date (worker publishes when due). |
| `POST /api/content/[id]/publish` | `{connectionId?}` / `{manual: true, externalUrl?}` | 30/min, `approve`. Guarded by `isExportableContent` (approved + recorded approver). Provider path: creates a `Publication` (`attempting`), calls the adapter through safe-fetch, stores the raw response; without a connection → honest `blocked`. Manual path records a real live URL (`manual: true`). Idempotency key prevents duplicate publications. |
| `GET /api/campaigns` | — | Campaigns with content/metric summaries. |
| `POST /api/campaigns` | `{name, objective, targetAudience, keyMessage, cta, channels, formats, successMetric, …}` | `write`. |
| `GET /api/campaigns/[id]` | — | Detail + items + metrics + experiments. |
| `PATCH /api/campaigns/[id]` | Partial fields | `write`; status transitions via the campaign state machine. |
| `DELETE /api/campaigns/[id]` | — | `write`. Content is kept (campaignId set null). |
| `POST /api/campaigns/[id]/duplicate` | — | `write`. Clones the campaign as `draft` (no metrics/publications copied). |

## Audience, links, metrics, experiments

| Method & path | Body | Notes |
| --- | --- | --- |
| `GET /api/audience` / `POST /api/audience` | `{title, body, source?, confidence?}` | Audience insight CRUD (write for POST). |
| `PATCH /api/audience/[id]` / `DELETE` | Partial | `write`. |
| `GET /api/links` / `POST /api/links` | `{targetUrl, campaignId?, contentItemId?, utm?}` | 30/min. Creates a `/t/<slug>` tracked link (http/https targets only). |
| `POST /api/metrics` | `{campaignId, metric, value, source?, note?, recordedAt?}` | Records campaign metrics (`provider` or `manual`). |
| `GET /api/experiments` / `POST /api/experiments` | `{title, hypothesis, variable, successMetric, campaignId?, channel?, audience?}` | Experiment CRUD. |
| `GET /api/experiments/[id]` / `PATCH` | `{results?, interpretation?, status?, …}` | `write`. Conclusions should carry a `metricsSnapshot`; the learning engine (`learning.ts`) drafts verdicts from recorded data and says "not enough data" when evidence is thin. |

## Publishing connections & usage

| Method & path | Body | Notes |
| --- | --- | --- |
| `GET /api/connections` | — | Lists connections with **`hasKey` only** — API keys never leave the server. |
| `POST /api/connections` | `{adapter, channel, label, credentials}` | `write`. `adapter` must be an **enabled** provider from `src/lib/distribution/providers.ts`; none is enabled until SocialFlow.ai is verified, so today this returns **400** with the export-mode explanation. Credentials are AES-256-GCM encrypted at rest and validated by the provider. |
| `POST /api/connections/[id]` | — | Re-tests the connection through its provider. Returns 400 for a `removed` connection or a provider that is not enabled. |
| `DELETE /api/connections/[id]` | — | Removes the connection. |
| `GET /api/usage` | — | `ModelCall` ledger for the workspace: calls, tokens, estimated cost, fallback share, quota state. |

## Infrastructure

| Method & path | Auth | Notes |
| --- | --- | --- |
| `POST /api/worker/tick` | `Authorization: Bearer $WORKER_SECRET` | Advances publications due now (bounded retries) and agent workflows (`advanceWorkspace`, max 4 tasks/workspace/tick). In production the dev-default secret is **rejected at boot** (fail-fast env validation). |
| `GET /t/[slug]` | none (public) | Tracked-link redirect: records a first-party click + visitor cookie, 307 to the UTM-decorated target. http/https targets only; unknown slugs redirect to `/`. |

---

## Conventions

- **Errors**: `400` validation, `401` unauthenticated, `403` wrong role /
  cross-origin, `404` not-found **or not yours** (never leaks existence),
 `409` state conflict, `413` body oversize, `429` rate limited, `500`
  unexpected (sanitized; details in server logs / DB trails).
- **Idempotency**: content publication and agent-task creation are
  deduplicated by unique keys (`Publication.idempotencyKey`,
  `AgentTask.dedupeKey`) — retries never duplicate side effects.
- **All mutating routes** cap bodies at 512 KB and validate with zod before
  any domain logic runs.

Example — the minimal happy path (see `scripts/e2e-acceptance.sh` for all 42
checks with exact payloads):

```bash
curl -c jar -X POST localhost:3000/api/auth/signup -H 'content-type: application/json' \
  -d '{"email":"founder@example.com","password":"…","name":"Founder"}'
curl -b jar -X POST localhost:3000/api/goals -H 'content-type: application/json' \
  -d '{"rawInput":"Grow a founder audience on X with 3 threads a week for 2 weeks"}'
curl -b jar -X POST localhost:3000/api/goals/<id>/plan/approve \
  -H 'content-type: application/json' -d '{"decision":"approve"}'
curl -b jar -X POST localhost:3000/api/goals/<id>/advance
```
