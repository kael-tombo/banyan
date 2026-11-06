# Agent orchestration: Banyan, OpenCode and SocialFlow Lite

Written 2026-11-03, governance update 2026-11-04. Decision records: [ADR-006](../ARCHITECTURE_DECISIONS.md#adr-006--opencode-as-the-agent-runtime-banyan-as-the-control-plane), [ADR-007](../ARCHITECTURE_DECISIONS.md#adr-007--model-governance-for-the-agentic-runtime-one-ledger-one-quota-validated-tiers).
Read with [AGENTIC_RUNTIME.md](../AGENTIC_RUNTIME.md) (today's runtime) and
[AGENTIC_PHILOSOPHY.md](../vision/AGENTIC_PHILOSOPHY.md) (what the agents may do and why).

## The decision in one paragraph

Three systems, three jobs. **Banyan is the control plane**: it owns goals, the task graph, approvals, the autonomy
policy, credits, tenancy, time, and every side effect. **OpenCode is the agent runtime**: embedded in Banyan's worker
as a library (`@opencode/sdk`, V2), it runs the multi-step, tool-using work (research, strategy, writing, critique,
analysis) as sessions, with subagents as child sessions. **SocialFlow Lite is the execution boundary**: a model-free
publisher Banyan calls deterministically. Agents can read and *propose*; they can never approve, publish, schedule,
connect, spend or change their own rules, and that is enforced by what tools exist, not by prompts.

```
                       ┌──────────────────────── Banyan (control plane) ────────────────────────┐
 founder ── web app ──▶│ goals · task graph · approvals · autonomy policy · spot checks · credits │
                       │ tenancy · scheduler (cycles, digests) · ledger · audit                   │
                       │                                                                          │
                       │  worker (Node 24)                                                        │
                       │  ┌─ AgentRuntime ─────────────────────────────────────────────────────┐  │
                       │  │ direct: one model call per task (today, fallback)                   │  │
                       │  │ opencode: embedded @opencode/sdk host                               │  │
                       │  │   session per AgentTask ── subagent child sessions (depth 1)        │  │
                       │  │   banyan plugin, one instance per workspace: read + propose tools   │  │
                       │  └─────────────────────────────────────────────────────────────────────┘  │
                       │        proposals ─▶ verify.ts · claims guard · critic ─▶ policy / founder │
                       │        approved ─▶ publishing core ─▶ SocialFlow adapter (REST, idempotent)│
                       └───────────────────────────────────────────────┬──────────────────────────┘
                                                                       ▼
                                                      SocialFlow Lite (model-free) ─▶ LinkedIn / X
                                                       ▲ MCP: founder's own OpenCode "operator" (opencode/)
```

## Why this split

| Question | Answer | Why |
| --- | --- | --- |
| Who is the orchestrator? | **Banyan.** The task graph in `src/lib/agents/orchestrator.ts` stays the system of record. | It already has leases, retries, dependency resolution, verification, approvals, credits and per-workspace isolation. OpenCode says its session instances are "not an authorization or storage-isolation boundary" (`packages/sdk/README.md`). |
| What does OpenCode add? | The **inner loop** of a task: plan, call tools, delegate to subagents, check, finish. | Today each Banyan task is one model call. Tool use and delegation are what make research, writing and critique better, and OpenCode has them built, durable and permissioned. |
| Why embedded, not a server? | No listener to secure, no network hop, no second deploy. | V2's SDK "executes Server's assembled HTTP router in memory, opening no listener" and recovers sessions from its database after a restart. |
| Why not let OpenCode loop on goals (`/goal`)? | Time, budgets and policy belong to Banyan. | OpenCode's goal plugin loops until a reviewer says done; Banyan must decide when a cycle runs, under which budget and policy. OpenCode's `experimental/schedule` is unused for the same reason. |
| Where does SocialFlow Lite fit? | Behind Banyan's publishing core only. Agents never hold its key or its publish tools. | Publishing is a side effect in the founder's name; it stays deterministic, idempotent and re-checked against approval at every attempt. |

## What OpenCode V2 provides (read from source, 2026-11-03, `anomalyco/opencode@1bf08ae`, packages 2.2.5)

| Capability | Where | How Banyan uses it |
| --- | --- | --- |
| Embedded host | `@opencode/sdk` `OpenCode.create({ config, plugins, instances, database })` | One host per worker process. |
| Sessions with metadata | `sessions.create({ agent, model, location, metadata, permissions })` | One root session per AgentTask, `metadata: { workspaceId, taskId, runId }`. |
| Agents | config `agents.<id>`: `mode`, `model`, `system`, `steps`, `permissions` | Banyan's roles, generated from Banyan config (below). |
| Subagents | `subagent` tool (`core/src/tool/plugin/subagent.ts`): child session, fresh context, foreground or background, follow-up by `sessionID`, depth limit `experimental.subagent_depth` (default 1), governed by the `subagent` permission | The strategist and creator delegate to researchers, channel writers and a critic. |
| Durable subagent jobs | `core/src/session/subagent-job.ts` (Jobs with recovery) | A worker restart resumes them. |
| Permissions | ordered rules `{ action, resource, effect: allow \| ask \| deny }`, last match wins; per agent and per session | Deny everything, then allow the agent's own Banyan tools. |
| Typed tools from plugins | `ctx.tool.transform(t => t.add({ name, input, output, execute }))` with Effect `Schema` | Banyan's read and propose tools, executed in-process against Prisma. |
| Per-session plugin instances | `instances: { key(session), configure(key) }` | Key = `workspaceId`, so every tool is bound to one workspace by closure. |
| Human input | permission requests (`permissions.reply`) and forms (`sessions.form`, `form/{id}/reply`) | Not used headless; questions go through a Banyan tool instead (below). |
| Usage | `sessions.stats` (tokens, steps, tool calls, cost) across the session tree | Ledger and credit settlement. |
| Interrupt | `sessions.interrupt` | Budget and pause enforcement. |

### Verified by a spike (Node 24.22.2, `opencode-go/glm-5.3-flash`, 3 runs)

A `strategist` agent with a `banyan` plugin (tools `banyan_read_context`, `banyan_propose_draft`, and a
`banyan_publish_now` it was denied) was told to plan launch posts **and publish them right away**:

- It read the context, then started **two `writer` subagents** (child sessions), which proposed one X draft
  (163–238 chars) and one LinkedIn draft (656–1042 chars).
- Child sessions **inherited the root's metadata** (`workspaceId`, `taskId`).
- **The denied tool was never called, and never offered**: the model's own reasoning says "there's no such tool in my
  toolset". A denied tool is removed from the model's view, so no prompt can talk an agent into it.
- Every tool call ran inside the workspace closure (`ws_123`).
- `sessions.stats` reported the whole tree: ~7k input / 1.1k output tokens, 8 steps, 6 tool calls, 33–49 s.
  `cost` is 0 for Go, so Banyan must price calls itself (it already does in `ModelCall`).

### Constraints found

1. **Node 24 is required.** The SDK uses `await using`; Node 22 (Banyan's images: `node:22-alpine`) fails to parse it.
   The worker moves to Node 24 first; the web app can follow.
2. **The V2 API is days old** (2.2.5 published 2026-11-02; some session APIs are under `experimental`). Pin the exact
   version, keep it behind Banyan's `AgentRuntime` interface, and keep the `direct` runtime as the fallback.
3. **Storage is SQLite** (`node:sqlite`). One database file per worker replica on a volume. A task whose lease moves
   to another replica starts a fresh session; tools are idempotent, so nothing is duplicated.
4. **Not an isolation boundary.** Tenancy comes from Banyan: per-workspace plugin instances, tools without a
   workspace argument, and every tool re-checking that the workspace exists and its agents are not paused.
5. **OpenCode Go is for internal use only.** Production agents use direct provider keys.

## Design

### 1. The runtime seam

```ts
interface AgentRuntime {
  run(task: { workspaceId; taskId; runId; role: AgentRole; brief: string; budget: Budget }): Promise<AgentRunResult>
  resume?(task, sessionRef): Promise<AgentRunResult>   // after a lease expiry on the same replica
  cancel(sessionRef): Promise<void>                    // pause, budget, founder stop
}
// AgentRunResult = { status: "completed" | "waiting_input" | "budget_exhausted" | "failed",
//                    proposals: ProposalRef[], usage, sessionRef, summary }
```

`AGENT_RUNTIME=direct|opencode` (default `direct`). Handlers call the runtime and then do exactly what they do today
with its proposals: verification schemas (`verify.ts`), the claims guard, draft checks, then the autonomy policy or the
founder. If the OpenCode runtime throws or is unavailable, the handler falls back to `direct`, labelled as such.

### 2. Agents (generated from Banyan config, never hand-edited)

| Agent | Mode | Model tier | May call | Produces |
| --- | --- | --- | --- | --- |
| `planner` | primary | strong | read tools, `banyan_propose_plan`, `banyan_ask_founder` | a plan proposal (waits for approval, as today) |
| `strategist` | primary | strong | read tools, `subagent` (researcher, critic), `banyan_propose_strategy`, `banyan_ask_founder` | a strategy proposal |
| `researcher` | subagent | fast | read tools, `banyan_web_search` (only when a verified provider exists), `banyan_record_note` | notes stored with `hypothesis` or `external_observation` provenance |
| `creator` | primary | strong | read tools, `subagent` (writer, critic) | drafts, via writers |
| `writer` | subagent | fast | read tools, `banyan_channel_rules`, `banyan_propose_draft` | one channel draft |
| `critic` | subagent | critic, **different family from the writers and the strategist** | read tools, `banyan_flag` | flags: unsupported claim, off-voice, banned term, risky topic |
| `analyst` | primary | strong | read tools incl. results, `banyan_propose_recommendation` | a recommendation citing recorded evidence |

Every agent starts from `{ action: "*", resource: "*", effect: "deny" }` and is allowed only its own tools. Subagent
depth stays 1 (subagents cannot spawn). `steps` caps each agent's loop. The config is built by a pure function from
Banyan's env (`AGENT_MODEL_STRONG`, `AGENT_MODEL_FAST`, `AGENT_MODEL_CRITIC`), so tests can assert, for example, that
no agent can reach a tool that changes state outside proposals.

### 3. Tools (the only way an agent touches Banyan)

| Kind | Tools | Rule |
| --- | --- | --- |
| Read | `banyan_read_context` (approved profile, facts with provenance, learning memory), `banyan_channel_rules` (limits from SocialFlow `get_account_capabilities`, voice, banned terms), `banyan_results` (recorded outcomes only) | Workspace from the closure. Untrusted text comes back fenced and labelled (`src/lib/ai/untrusted.ts`). |
| Propose | `banyan_propose_plan`, `banyan_propose_draft`, `banyan_propose_strategy`, `banyan_propose_recommendation`, `banyan_record_note`, `banyan_flag` | Writes a proposal row tied to `taskId`, idempotent by a dedupe key (`taskId:channel:n`), status always "waiting for review" (or the policy's decision later, outside the agent). |
| Ask | `banyan_ask_founder` | Creates a Banyan question and ends the run as `waiting_input`. The founder's answer is sent into the same session as a new prompt. No OpenCode `ask` permissions in production: nobody is watching a terminal. |
| Never | publish, schedule, cancel, approve, connect or disconnect accounts, change policy, spend credits, send messages | Not registered at all, so not even visible to a model. |

### 4. Tenancy and safety

- Plugin `instances.key(session) = session.metadata.workspaceId`; `configure(workspaceId)` builds the `banyan` plugin
  bound to that workspace. Tool inputs never contain a workspace id.
- Each tool call re-reads the workspace (exists, not archived, agents not paused). A pause interrupts running sessions
  (`sessions.interrupt`) and the next tool call fails closed.
- Session `location` is an empty per-worker sandbox directory; OpenCode's file, shell, web and MCP tools are denied.
- Prompt injection can at worst produce a bad proposal. It still faces the claims guard, the critic, the draft checks,
  the autonomy policy, spot checks and the founder, and the agent has no tool with a side effect.

### 5. Budget, metering, credits (ADR-007)

- **Daily quota**: one run consumes **one unit** of the same per-workspace `MODEL_MAX_CALLS_PER_DAY` quota as a
  single-shot call, checked *before* the session starts (`checkRunQuota` in `src/lib/model/router.ts`). Completed runs
  are recorded in the same `ModelCall` ledger, so the existing count covers them; no second counter exists. When
  refused, the task degrades to the labeled template path, exactly like an over-quota single-shot call.
- **Per run**: `steps` per agent (the bound until R4), plus a token budget enforced by a plugin hook on each model
  request; over budget, the run ends `budget_exhausted` and keeps its proposals.
- **After each run**: `recordAgentRun` writes **one** `ModelCall` row with the session tree's aggregate usage
  (`sessions.stats`, broken down per model) and Banyan's own price table. A non-zero cost is a true total: when any
  model in the run has no known price, the row records tokens with cost 0 and a structured warning names the
  unpriced models — prices are never guessed and a partial sum is never presented as a total. The credit hold is
  settled as for direct calls today.
- **Per cycle** (Level 3 prerequisite): a cycle budget in credits that Banyan checks before starting each task.

### 6. Durability

Banyan's lease stays the source of truth. The run stores `sessionRef` (replica + session id) on the `TaskRun`. On lease
expiry, the same replica resumes the session; another replica starts a fresh one. Proposal tools are idempotent, so a
replayed tool call returns the existing proposal instead of creating a second one.

### 7. SocialFlow Lite

- **Banyan to SocialFlow Lite**: the existing adapter (REST or MCP transport, idempotency keys, status sync C7), called
  only by the publishing core after approval. Unchanged.
- **Agents to SocialFlow Lite**: never directly. `banyan_channel_rules` reads capabilities through the adapter, so the
  key never enters an agent's context or config.
- **Founder to SocialFlow Lite**: the OpenCode operator in `socialflow-lite/opencode/` (reads freely, asks before
  every write, cannot disconnect). An operations tool for the founder's own accounts, not part of Banyan's runtime.
- SocialFlow Lite stays model-free.

### 8. Models ("the brain")

One source of truth: Banyan's env, injected into the OpenCode config.

| Use | Development | Production |
| --- | --- | --- |
| Strong (planner, strategist, creator, analyst) | `opencode-go/glm-5.3-flash` | a direct provider key, e.g. `anthropic/claude-sonnet-5-5` |
| Fast (writer, researcher) | `opencode-go/glm-5.3-flash` | e.g. `anthropic/claude-haiku-5-5` |
| Critic | a second Go model (e.g. `opencode-go/deepseek-v4.1-flash`) | a different family from the writer |
| Single-shot calls, fallback | the existing router (`src/lib/model/router.ts`) | the same |

The template fallback still exists and is still labelled. OpenCode Go's terms limit it to the founder's own internal use.

Tiers are validated at the env boundary (ADR-007): `AGENT_RUNTIME` and `AGENT_MODEL_STRONG/FAST/CRITIC` join the zod
schema in `src/lib/env.ts` (a non-empty value must look like `provider/model`; a missing strong model fails startup
only when `AGENT_RUNTIME=opencode`). In production, `modelTiers` **refuses** a critic from the same model family as the
writers or the strategist, and refuses OpenCode's hosted inference, at boot. In development both are warnings or allowed. Until the
embedded runtime exists (R2), `resolveRuntimeSelection` (`src/lib/agents/runtime/select.ts`) resolves
`AGENT_RUNTIME=opencode` to `direct` with a labelled reason — never silently, never a crash. The development-only
"OpenCode brain" (`scripts/opencode-brain.mjs`) is a separate, V1 text-in/text-out gateway and retires when R2 ships.

### The generated roster, checked in real OpenCode (2026-11-03)

`buildOpenCodeConfig` (`src/lib/agents/runtime/roster.ts`) was exported and loaded into the embedded host with stub
tools for the whole catalogue. OpenCode accepted all seven agents with the right modes. Told to write a post with the
writer, then to also start the researcher and the strategist, the `creator` started a `writer` and a `critic`; the
`researcher` call came back `permission.rejected: "Permission denied: subagent"` without running, and the
`strategist` call failed with "cannot run as a subagent". The unit tests model OpenCode's rules (deny first, last
match wins, the subagent permission's resource is the agent id) and this run confirms that model.

## Open: a separate platform instead of R2

A review on 2026-11-06 found problems with this design that R2 would run into. The web process also runs handlers, so it
would load an SDK that needs Node 24. Subagents make fan-out unbounded until R4. Falling back to `direct` after a partial
run can duplicate drafts. `central-brain-agent-platform` (a separate repo, not yet published) addresses these by running
OpenCode behind HTTP. Adopting it would supersede ADR-006 and replace R2. Nothing in Banyan depends on it yet.

## Roadmap

| Step | What | Done when |
| --- | --- | --- |
| **R1 · Seam** | `AgentRuntime` interface, `direct` runtime wrapping today's handlers, agent-config builder and tool catalogue as pure, tested modules | No behaviour change; tests pin "no agent can reach a side-effect tool". **Partly done 2026-11-03/04**: `src/lib/agents/runtime/{types,tools,roster,select}.ts`, the ADR-007 governance modules (`src/lib/model/agent-run.ts`, `checkRunQuota`/`recordAgentRun` in the router, validated `AGENT_*` env) and their tests; the `direct` runtime adapter is next |
| **R2 · Worker on Node 24** | Worker image to `node:24-alpine`, pin `@opencode/sdk@2.2.5`, the OpenCode runtime behind `AGENT_RUNTIME=opencode`, first task type: `research` | A research task runs through OpenCode in a throwaway workspace, its notes carry provenance, usage lands in `ModelCall`, killing the worker mid-run duplicates nothing |
| **R3 · Creator team** | `creator`, `writer` and `critic` agents; critic flags feed the autonomy policy | One draft per channel, critic flags visible on the draft, supervised approval unchanged |
| **R4 · Ask and budgets** | `banyan_ask_founder` with `waiting_input`, per-run token budgets, per-cycle credit budgets, an incident log | A run that needs an answer pauses and resumes in the same session; an over-budget run stops cleanly |
| **R5 · Level 3** | Continuous cycles started by Banyan's scheduler inside the cycle budget, with sampling (spot checks, built) and incident review | Several measured cycles in one workspace without a founder prompt, every one inside its budget and policy |
| **R6 · Command center** | The founder's chat as an OpenCode session with read and propose tools | Questions about the product, its results and its drafts answered from recorded data |

Order matters: R1 has no dependency on OpenCode, so it can ship before the Node 24 move, and R2 is the first point
where OpenCode runs in Banyan.
