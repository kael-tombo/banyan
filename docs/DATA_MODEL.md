# Banyan — Data Model

Reference for the Prisma schema (`prisma/schema.prisma`): 23 models, SQLite,
2 additive migrations (`20261027081750_init`,
`20261028072735_agentic_execution_runtime`). SQLite has no native enums —
every status is a validated string whose legal transitions live in
`src/lib/state-machines.ts` and zod schemas.

---

## 1. Entity map

```
User ─┬─ Session
      ├─ Membership ─── Workspace (tenant root; everything scopes by workspaceId)
      ├─ ContentItem.approvedBy
      └─ GoalPlan.approvedBy

Workspace ─┬─ ProductProfile (1:1)
           ├─ AudienceInsight      ├─ ProfileFact        ├─ ModelCall
           ├─ Goal ─┬─ GoalPlan (1:1)
           │        ├─ AgentTask ── TaskRun
           │        ├─ Campaign (goalId, SetNull)
           │        └─ Recommendation (goalId, SetNull)
           ├─ Campaign ─┬─ ContentItem ─┬─ ContentRevision
           │            │               ├─ Publication ── ChannelConnection
           │            ├─ TrackedLink ── MetricEvent
           │            ├─ CampaignMetric
           │            └─ Experiment
           └─ ActivityEvent
```

- `SetNull` on campaign/goal deletion preserves the child records (content,
  publications, experiments) — history is never destroyed by a parent delete.
- `Cascade` is used only where children are meaningless without the parent
  (sessions, memberships, task runs, per-workspace rows).

## 2. Identity & tenancy

| Model | Purpose | Notable fields |
| --- | --- | --- |
| `User` | Account. Password stored as bcrypt hash (cost 12). | `onboardingCompletedAt`; signup attribution (`attributedLinkId/CampaignId/Source`) recorded **only** when a tracked visitor cookie was present — observed, not inferred. |
| `Session` | DB-backed session. Stores only `tokenHash` (HMAC of the cookie value with `APP_SECRET`); the raw token never touches the DB. | `expiresAt` (30-day TTL). |
| `Workspace` | Tenant root. Every domain table carries `workspaceId`. | `isSelf` marks Banyan's own self-distribution workspace. |
| `Membership` | User ↔ workspace with `role`: `owner` \| `member` \| `viewer`. | Unique per (user, workspace); roles enforced by `requireRole` (`read`/`write`/`approve`/`control` capability levels). |

## 3. Product context

| Model | Purpose | Notable fields |
| --- | --- | --- |
| `ProductProfile` | 1:1 workspace product context captured at onboarding. | `stage` (`idea|building|launched|growing`), `goal` (`first_users|launch|audience|leads|activation|conversions`), `channels` (JSON array), `brandVoice` (JSON: tone/language/themes/avoid/cta/approvalPreference). |
| `AudienceInsight` | Audience hypotheses/notes. | `source` (`assumption|interview|research|observed`), `confidence` (`low|medium|high`). |
| `ProfileFact` | **Provenance-bearing** reusable business context used by agent prompts. Unique per (workspace, category, key). | `category` (`product|audience|positioning|voice|competitor|constraint|resource|metric|research`); `provenance` (`verified|user_provided|external_observation|hypothesis`); `source` traces origin (e.g. `task:<id>`); user corrections reset `verifiedAt`. Prompts render every fact with its provenance label, so a hypothesis can never silently become a fact. |

## 4. Distribution: campaigns, content, publishing

| Model | Purpose | Notable fields |
| --- | --- | --- |
| `Campaign` | One message → one audience → one declared success metric. | `status`: `draft|planned|in_progress|completed|archived`; `successMetric`; optional `goalId` when agent-produced. |
| `ContentItem` | A channel/format-specific asset and its review state. | `channel` (`x|linkedin|shortvideo`); status machine below; `approvedById/At` (the human decision record); `generationMeta` JSON (`{provider, model, isFallback, note, tokens}` — fallback always labelled); `videoExtras` JSON for short-form video (hook/scenes/on-screen text/caption/cta). |
| `ContentRevision` | Immutable snapshot per save/generation. | `authorType` (`ai|user`) + `note`. Generation never overwrites user edits — a new revision is created. |
| `ChannelConnection` | Per-channel publishing destination. | `adapter` (`postiz|manual`); `configEncrypted` — AES-256-GCM encrypted JSON `{baseUrl, apiKey, integrationIds}`; `status` (`configured|verified|error`); API responses expose `hasKey`, never the key. |
| `Publication` | The execution record per publish attempt. | Status machine below; `providerResponse` (raw payload, audit trail); `idempotencyKey` **unique** (duplicate-publish prevention across retries); `manual` flag for user-recorded publications; `externalId/externalUrl` only after provider confirmation. |
| `TrackedLink` | First-party attribution link (`/t/<slug>`). | `clicks`, `lastClickAt`; redirect restricted to http(s). |
| `MetricEvent` | First-party funnel events: `visit|signup|onboarding_complete`. | Attribution via `visitorId` cookie + `linkId`. |
| `CampaignMetric` | Provider- or manually-entered campaign metrics. | `source` (`provider|manual`), `metric` (impressions/engagements/link_clicks/signups/…), `value`. |
| `Experiment` | Hypothesis → result → interpretation loop. | Status below; `results/interpretation/limitations/nextAction` (free text, agent- or user-drafted); `metricsSnapshot` JSON — the actual observed numbers at conclusion time. |

### Content status machine

```
draft → ready_for_review → approved → scheduled → publishing → published
                │                │            │            └→ failed
                │                │            └→ (due) publishing
                │                └→ (edit) draft   [approval invalidated]
                └→ rejected (reason stored)          │
                                                     └→ blocked (no connection)
any → archived
```

`isExportableContent` (publishing guard) accepts only `approved`,
`scheduled` or the transient `publishing` state, **and** requires
`approvedById`. Editing approved copy resets it to `draft` — the approval
is invalidated and the gate re-requires a human decision.

### Publication status machine

```
scheduled → attempting → published   (provider confirmed)
                │     └→ failed      (attempts exhausted; user retry)
                └→ blocked           (no connection / unsupported channel — honest stop)
```

`published` requires either provider confirmation or a human-recorded live
URL. "Accepted by provider" is never reported as "published" ahead of
evidence; uncertain timeouts reconcile via status checks instead of blind
retry (the unique `idempotencyKey` prevents duplicates).

## 5. Agentic execution

| Model | Purpose | Notable fields |
| --- | --- | --- |
| `Goal` | The persistent, measurable objective; execution envelope for everything else. | Status below; `progress` 0–100 cached from task completion; `rawInput` (the original natural-language instruction); `successMetric/metricTarget/metricUnit/deadline/constraints`. |
| `GoalPlan` | 1:1 with the goal; drafted by the planner. | Status `planned|approved|rejected|superseded`; JSON `assumption/missingInfo/risks` arrays + `phases`; `approvedById/At` — no consequential task runs before approval. |
| `AgentTask` | One unit of agent work; the audit trail of what was asked and what happened. | `dedupeKey` **unique** (idempotent creation across ticks/crashes); `type` (11 types); `agentRole` (6 roles); status below; JSON `inputs/expectedOutput/output/verification/dependsOn`; `attempts/maxAttempts` (bounded retries); `leasedUntil` (crash-recovery lease). |
| `TaskRun` | Per-attempt execution record. | Status `running|completed|failed|requeued`; `log` JSON (`[{at, step, detail}]`); `error`. |
| `Recommendation` | Evidence-backed next action. | `evidence` JSON array — each entry **must cite recorded data** (`{source, ref, summary}`); `confidence` forced to `low` when evidence is empty; `uncertainty` disclosed; `status` `open|accepted|dismissed|acted_upon`; `producedBy` (e.g. `agent:analyst`). |
| `ModelCall` | Usage ledger; one row per routed call (live, fallback, failed). | `purpose/provider/model/isFallback`, tokens, `estCostMicros` (0 when pricing unknown — never guessed), `latencyMs`, `ok/error`. Powers the daily quota and `GET /api/usage`. |

### Goal status machine

```
draft → planning → awaiting_approval → active → achieved | missed
                        │ (rejected)      └→ paused → active
                        └→ draft (re-plan)      any → cancelled
```

### Agent task status machine

```
pending → ready → running → completed
   │        │        ├→ failed (attempts left → ready [requeue]; else failed)
   │        │        └→ blocked (dependency failed/cancelled, non-observer)
   │        └→ waiting_approval (approval_gate) → completed (human decision)
   └→ cancelled
Observers (measure/evaluate/recommend) also promote when a dependency
ended blocked — reporting recorded reality is their job.
```

## 6. Conventions for schema changes

1. Additive-only migrations so far; never edit a shipped migration.
2. New statuses must get entries in `src/lib/state-machines.ts` (transition
   map + guards) — untyped status strings in handlers are a bug.
3. Queryable/integral data is a real column; genuinely schemaless payloads
   may be JSON-in-TEXT with a documented shape (as done above).
4. Every workspace-owned table carries `workspaceId` **and** a
   `@@index([workspaceId, …])` — tenant scoping relies on it.
5. Back up the SQLite file before migrating (`cp db/custom.db
   db/custom.db.bak-$(date +%F)`) — see the runbook.
