# Decision needed: one cycle pipeline, not two

Found 2026-11-01 while walking a brand-new account through the app.

## What exists

Banyan delivers its one promise through **two separate pipelines**, and a new founder sees both.

| | Launch path | Cycle intake |
| --- | --- | --- |
| Entry | Dashboard step 1 "Add your product" → `/app/product` | "Start a cycle" → `/app/cycles/new` |
| Product understanding | Website analysis of up to 3 pages (US-021–024), profile approval | One public page read, snapshot saved |
| Plan | `Strategy`: structured, versioned, approved (US-042/043) | `Goal` + `GoalPlan`, run by the agent orchestrator |
| Content | Drafts from the approved strategy (US-044), claims guard | Agent content tasks |
| Distribution | Campaign lifecycle, distribute / posting kit (US-046–049) | Agent publish task |
| Autonomy | Autopilot (Level 1) and **supervised autonomy (Level 2)** | Orchestrator gates |
| Credits | Draft runs reserve and settle credits | Not charged |
| Closing | Results, recommendations | **Cycle report** and **next cycle** |
| Shown as progress | Launch path on the dashboard | Cycle cockpit `/app/cycles/[id]` |

## Why it matters

- **Two entry points for one thing.** A founder sees "Add your product" and "Start a cycle", which lead to different
  places and produce different objects. Until 2026-11-01 the dashboard showed both on day zero.
- **Features split across them.** Level 2 autonomy and credits live on the launch path. The cycle report and next
  cycle live on the goal path. No single path does the whole promise.
- **Double maintenance.** Every fix (claims, approvals, publishing) has to be checked against both.

## Recommendation

**Make the launch path the cycle**, and use `Goal` only as the cycle's container (objective, metric, window):

1. Product: `/app/product` analysis plus approval (already the richer intake). Fold in the cycle intake's single-page
   snapshot as its "quick start".
2. Each cycle = a `Goal` that owns one `Strategy` version and one `Campaign`. The Strategy is the plan, which
   replaces `GoalPlan` for new cycles.
3. Point the cycle report and next cycle at the campaign's items, which they already read through
   `goal.campaigns`, and keep the cockpit as the cycle view.
4. Retire the orchestrator's plan, content and publish tasks for new cycles. Keep them read-only for existing goals.

Effort: medium (about 1–2 weeks). It touches the agent orchestrator, the cycle cockpit and the intake, but most
building blocks exist.

## What was done meanwhile (no decision taken)

- Day-zero dashboard: one way in (the launch path), what the founder decides, and a secondary link to the cycle
  intake. No competing buttons, no wall of zeros.
- The "Finish setup" banner no longer competes on the dashboard or on the two intake pages.

**Decision owner:** the founder. Until decided, both pipelines keep working.

## Progress

**Step 1 — done 2026-11-01: the launch path produces cycles.**

- When a strategy's campaign is created, a cycle goal opens with the strategy's objective, primary KPI and target, its
  channels, and a 14-day window (`src/lib/cycle/strategy-cycle.ts`). It never runs the orchestrator. Existing strategy
  campaigns get their cycle the next time they are touched.
- Its progress is the published share of its drafts. The orchestrator no longer resets task-less goals to 0%.
- Its cockpit shows the strategy as the plan, and its report works unchanged. The report recognises the strategy KPI
  names (`tracked_visits`, `publications`).
- "Suggest the next move" proposes one change from the report's recorded numbers (`src/lib/cycle-recommend.ts`,
  with the analyst's confidence thresholds). One recommendation per cycle.
- "Start the next cycle" on a strategy-backed cycle opens the next cycle and has the strategist draft the next
  strategy carrying the change, for approval. Older goal-run cycles keep their workflow.
- Checked end to end against the dev server and database: cycle opened, KPI and channels carried, progress 50%,
  next move proposed (a second request refused), next cycle opened, strategy v2 drafted with the change, and zero
  orchestrator tasks.

**Next steps:** make the cycle intake (`/app/cycles/new`) feed the product profile and strategy instead of starting
the orchestrator (step 3/4 above), then retire the duplicate entry points.
