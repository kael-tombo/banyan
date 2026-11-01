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
- **SocialFlow.ai**: no verifiable API exists (socialflow.ai is a parked
  domain as of October 28 2026 — no developer documentation, auth model, or
  endpoints). No client was built and nothing is simulated. The supported
  path is the **manual handoff** (`GET /api/content/[id]/handoff` copies a
  channel-formatted package; the user executes it externally and records the
  live URL as a manual publication), with the capability registry reporting
  `unavailable` and the full activation checklist in
  [`docs/SOCIALFLOW_INTEGRATION.md`](SOCIALFLOW_INTEGRATION.md).

## Business context with provenance

`ProfileFact` rows store reusable context with explicit provenance:
`verified`, `user_provided`, `external_observation`, `hypothesis` — plus
confidence, source, timestamps and (for agent-produced facts) the producing
task id. Prompts render every fact with its provenance label, so generated
content can never treat a hypothesis as a fact. Users inspect and correct
everything in **/app/context**; corrections honestly reset verification.

**Learning memory.** Concluded experiments are context too. `loadBusinessContext`
reads the `Experiment` table at prompt time (`src/lib/learning-memory.ts` decides
what qualifies) and `contextBlock` renders a *Prior learning from concluded
experiments* section, labelled as recorded conclusions rather than proof. The
section reaches plan drafting, research, strategy and channel content (agent
drafts and manual generation), and the command-center chat brief. Only an
experiment that is `complete` **and** has a recorded interpretation qualifies —
a completed experiment without a conclusion is a data point, not learning, and
is excluded. No learning is copied into a second table, so correcting an
experiment immediately changes what the next plan reads. Memory is per
workspace; there is no cross-workspace learning.

## Autonomy levels

| Level | What Banyan does alone | Status |
| --- | --- | --- |
| 1 · Approved execution | Approving the profile starts the strategist; approving the strategy starts the creator (`src/lib/agents/autopilot.ts`). Nothing is approved or published without you. | Built |
| 2 · Supervised | Within a founder-set policy, routine drafts are approved and scheduled; everything else escalates with its reason (`src/lib/autonomy/`, `/app/autonomy`). | Built; scheduling path awaits a verified provider |
| 3 · Autonomous operations | Continuous cycles under budget, sampling and incident review | Out of scope (STRATEGY.md §12) |

**Level 2 rules.** The policy (`Workspace.autonomyPolicy`, versioned) names the channels Banyan may run, posts per channel per day, quiet hours and blackout dates in the workspace time zone, and whether approved posts are also scheduled. Only an owner or member changes it (`PUT /api/autonomy`); the system never calls `setPolicy`.

**Always escalated, whatever the policy says:** an unsupported claim, a banned term, an over-limit body, a template-fallback draft, the first post on a channel, any short-form video, and any channel outside the policy. Paused agents do nothing.

**Accountability.** An auto-approval approves exactly the revision that was checked (a concurrent edit wins), and is attributed to the founder whose policy allowed it. Every decision is an `autonomy` activity row with its reasons and policy version. That row feeds the decision log and the weekly digest on `/app/autonomy`. Scheduling picks the next slot that respects the daily cap, quiet hours, blackouts and a 3-hour gap between posts on a channel; with no verified connection the post stays approved and is logged as not scheduled.

**Verify:** `npx tsx --env-file=.env scripts/autonomy-check.ts` runs a supervision pass in a throwaway workspace against the real database (14 checks). Unit tests: `tests/autonomy-policy.test.ts`.

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

331 unit tests (Vitest) cover: goal/task state machines, dependency
resolution, observer bypass, failure propagation, lease expiry, bounded
retries, verification schemas, NL goal parsing, quota policy, cost
estimation, fallback labeling, recommendation confidence policy, learning
memory qualification and prompt injection, capability honesty, permissions,
and the publisher-handoff export guard. The pure orchestration logic
(`graph.ts`) is tested without a database by design.
