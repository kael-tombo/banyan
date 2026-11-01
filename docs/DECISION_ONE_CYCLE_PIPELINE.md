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
