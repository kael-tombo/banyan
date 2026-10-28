# Agentic Execution Runtime

This document describes Banyan's execution runtime: the goal model, the
orchestrator, the capability and model-provider boundaries, and an honest
account of what is implemented, what is verified, and what is unavailable.

## The execution loop

```
business context → plan (human approval) → research → strategy → campaign plan
  → channel-specific content → human approval gate → publishing
  → measurement → experiment evaluation → evidence-backed recommendation
```

Everything hangs off a persistent **Goal** (`objective`, success metric and
target, deadline, constraints, status, progress). A goal owns a **GoalPlan**
(drafted by the planner, requires explicit human approval), a tree of
**AgentTasks** with **TaskRuns** (the execution audit trail), any **Campaigns**
it produces, and its **Recommendations**.

## Orchestrator

One central runtime (`src/lib/agents/orchestrator.ts`) advances every workflow:

1. **Crash recovery** — running tasks hold a 5-minute lease; expired leases are
   requeued and their runs are recorded as such. Handlers adopt prior partial
   work (via stored outputs and unique dedupe keys) instead of duplicating it.
2. **Dependency resolution** — pending tasks are promoted when all
   dependencies completed. Observer tasks (`measure`, `evaluate`,
   `recommend`) are also promoted when dependencies ended *blocked* — their
   job is to report recorded reality, including after an unavailable
   integration.
3. **Failure propagation** — non-observer tasks depending on a failed/cancelled
   task are blocked, with the reason recorded.
4. **Bounded retries** — transient failures requeue automatically up to
   `maxAttempts`; permanent failures wait for an explicit user retry.
5. **Parallel execution** — only for tasks that are provably independent (no
   dependency path between them); concurrency is capped.
6. **Verification before completion** — every handler output must pass the
   task's declared verification criteria (`src/lib/agents/verify.ts`);
   unknown schema names fail loudly rather than passing silently.
7. **Progress accounting** — goal progress is the share of non-cancelled
   tasks completed, refreshed after each tick.

The orchestrator is triggered by `POST /api/goals/[id]/advance` (session,
rate-limited, write-role required), by the background worker tick
(`POST /api/worker/tick`, `WORKER_SECRET`), and advances safely under
concurrency (tasks are claimed atomically with a status-guarded update).

## Agent roles

| Role | Task types | What it does |
| --- | --- | --- |
| planner | `plan_draft` | Turns the natural-language goal into a structured plan: summary, assumptions, missing information, risks, phases. Waits for human approval. |
| researcher | `research` | Hypothesis-framed research brief. Stores angles as inspectable context with `hypothesis` provenance. |
| strategist | `strategy`, `campaign_plan` | Positioning + channel focus; creates the campaign with the goal's success metric. |
| creator | `content_draft` | Channel/format-specific drafts via the existing generation stack; drafts go straight to the review queue. |
| publisher | `approval_gate`, `publish` | Closes the human-approval gate; executes provider-confirmed publishing through the existing Postiz/manual flow. |
| analyst | `measure`, `evaluate`, `recommend` | Records real observed outcomes (honest zeros included), evaluates the experiment, and stores an evidence-backed recommendation with disclosed uncertainty. |

## Model provider abstraction

`src/lib/model/router.ts` is the single boundary between workflows and model
providers — the runtime never sees vendor types or credentials.

- **Managed access first**: the deployment's own OpenAI-compatible
  credentials serve every workspace; users never need a Claude/ChatGPT
  subscription.
- **User-provided keys** are an explicitly disabled future feature
  (`USER_MODEL_KEYS_ENABLED`); the resolver slot exists and is documented.
- **Quotas**: live calls are counted per workspace per UTC day against
  `MODEL_MAX_CALLS_PER_DAY` (default 500). When the quota is hit, workflows
  continue with the labeled template fallback — never silently degraded.
- **Usage ledger**: every call — live, fallback, or failed — is recorded in
  `ModelCall` with tokens, latency, and estimated cost in micro-USD (zero for
  models without a known price; costs are never guessed). Inspect it via
  `GET /api/usage` or the Settings page.
- **Extensibility**: adding a hosted or local provider means adding one
  resolver entry; no workflow code changes.

## Capability adapters

`src/lib/capabilities/` is the provider-independent boundary for external
capabilities. Adapters describe themselves, report health per workspace, and
keep vendor schemas inside their own module. Statuses are honest:
`available`, `needs_credentials`, `unverified` (implemented against the
vendor's documented API but not yet exercised with real credentials), or
`unavailable`.

### Fastlane (usefastlane.ai) — evaluation result

Evaluated against `https://developers.usefastlane.ai` (October 2026):

| Requested capability | Fastlane offers it? | Evidence |
| --- | --- | --- |
| Brand analysis | **No** — no such endpoints exist | The documented API has no brand-analysis surface |
| Creative generation | **Yes** | `POST /blitz` (async build), content angles CRUD, media bank |
| Publishing | **Partial** | `POST /content/:id/schedule` + `GET /posts` — but to Fastlane-managed (warmed TikTok/Instagram) accounts, not X/LinkedIn |
| Performance measurement | **Yes** | `POST /analytics/posts` (batch engagement metrics) |
| MCP | **Yes** | An MCP server exposes the same API with the same workspace API key |

**Implementation decision**: a `fastlane` capability adapter
(`src/lib/capabilities/fastlane.ts`) is registered for short-form creative
generation, scheduling, and post analytics — implemented against the
documented API, gated on `FASTLANE_API_KEY`, and marked **unverified** until a
real call succeeds. It is *not* wired into the publishing execution path
(Banyan's publication contract targets X/LinkedIn/short-video through Postiz
or manual recording). Brand analysis is not claimed anywhere. Without
credentials the adapter reports `needs_credentials` with setup guidance.

### Unavailable external services (honest list)

- **External research / web data**: no provider is verified in this
  deployment. Research tasks produce clearly labeled hypothesis briefs from
  your business context — never invented market facts. The `web-research`
  capability reports `unavailable` with this reason.
- **Postiz publishing**: available, but requires a workspace connection. With
  no connection, publications are recorded as **blocked** with actionable
  guidance; nothing is faked.
- **Live model access**: without `OPENAI_API_KEY` (or another configured
  provider) all generation uses the deterministic template fallback, always
  labeled as such.
- **Fastlane**: implemented against the documented API; `unverified` /
  `needs_credentials` until exercised (see above).
- **SocialFlow.ai**: adapter slot only; not implemented (unchanged from the
  prior release, no verified API documentation).

## Business context with provenance

`ProfileFact` rows store reusable context with explicit provenance:
`verified`, `user_provided`, `external_observation`, `hypothesis` — plus
confidence, source, timestamps and (for agent-produced facts) the producing
task id. Prompts render every fact with its provenance label, so generated
content can never treat a hypothesis as a fact. Users inspect and correct
everything in **/app/context**; corrections honestly reset verification.

## Permissions and safety

- Every API route resolves the workspace via `requireWorkspace()` and scopes
  all queries by `workspaceId`; new endpoints additionally enforce roles
  (`src/lib/permissions.ts`): read for all members, write/approve/control
  only for owner and member.
- Consequential actions are gated in the backend: plan approval and the
  content approval gate are recorded human decisions (`approvedById`);
  publishing refuses non-exportable content (`isExportableContent`).
- Duplicate side effects are prevented during retries: unique task dedupe
  keys, atomic status-guarded claims, the publishing flow's
  active-publication check and idempotency keys, and handler-level adoption
  of prior work.
- Credentials never reach the browser: connections are AES-256-GCM encrypted
  and decrypted server-side only; the model router executes server-side.
- Untrusted external content is never inserted into privileged instructions:
  research outputs are stored as data with hypothesis provenance, and no live
  external content source is wired in.

## Outcome intelligence

Activities, publications, tracked links, metric events and experiments
connect back to their campaign and goal. Measurement records what exists —
including true zeros and explicit data limitations ("no tracked links —
click attribution unavailable"). Recommendations must cite recorded evidence
and are forced to low confidence with disclosed uncertainty when evidence is
thin.

## Testing

116 unit tests (Vitest) cover: goal/task state machines, dependency
resolution, observer bypass, failure propagation, lease expiry, bounded
retries, verification schemas, NL goal parsing, quota policy, cost
estimation, fallback labeling, recommendation confidence policy, capability
honesty, permissions, and the publisher-handoff export guard. The pure
orchestration logic (`graph.ts`) is tested without a database by design.
