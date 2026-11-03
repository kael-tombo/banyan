# How Banyan's agents earn the right to act

Written 2026-11-02. This is the operating philosophy behind Banyan's autonomy, and what in the code holds each
principle in place. The strategic frame (Level 1 in the MVP, Level 2 supervised, Level 3 out of scope until it is
real) is in [STRATEGY.md](../../STRATEGY.md); the runtime is in [AGENTIC_RUNTIME.md](../AGENTIC_RUNTIME.md).

## The idea in one line

**Banyan takes the work; the founder keeps the decision; autonomy is earned from evidence, one channel at a time,
and only the founder grants it.**

An "autonomous distribution system" that posts in your name is only useful if you can trust it. Trust is not a
setting. It is a record: what the agents proposed, what you changed, what went out, what broke. Banyan keeps that
record, shows it, and asks for more room only when the record supports it.

## Seven principles, and what enforces each

| # | Principle | What enforces it today |
| --- | --- | --- |
| 1 | **The agents do the work; the founder makes the calls.** Research, strategy, drafts, adaptation, scheduling, publishing and measurement are the agents' job. Approving what goes out in the founder's name is not. | Approval is re-checked by the server at every publish attempt (`src/lib/publishing/publish.ts`); editing approved, scheduled or failed copy sends it back to review; role checks on every route that changes data (`tests/route-guards.test.ts`). |
| 2 | **Autonomy is earned, per channel, from the founder's own decisions.** | `src/lib/autonomy/trust.ts`: a channel qualifies only after 5+ human decisions, 80% approved as written, no rejections, no flagged claims, 2+ posts confirmed live, no failures. Drafts the policy approved itself, hand-written posts and template drafts never count. |
| 3 | **The system never widens its own mandate.** It may propose; only the founder accepts. | `policy.ts` invariant; proposals are applied only through the founder's `PUT /api/autonomy`, versioned with their name; a proposal never switches on auto-publishing. |
| 4 | **Some things always come back to a human**, whatever the policy says. | Supervised policy escalates unsupported claims, banned terms, over-limit copy, template drafts, the first post on a channel, any topic the founder lists ("always ask me about"), every draft on a channel whose last post failed until one goes out, and an unusual burst of approvals (over 3 days of the daily cap in 24 hours); short-form video is always published by the founder; one action pauses every agent. |
| 5 | **Nothing is claimed that did not happen.** "Published" means the platform confirmed it. | Status sync (C7): a post is live only when SocialFlow confirms it; no fabricated metrics; analytics marked unavailable rather than estimated; the claims guard blocks approval of unsupported claims. |
| 6 | **A failure is never billed, and never made worse.** | Template drafts are free; a crashed run's credit hold is returned; a post SocialFlow may still publish is cancelled or checked before any retry, so it is never posted twice. |
| 7 | **What needs the founder is always visible, and says what to do.** | One plain status per post with its next step (`plain-state.ts`); the rail counts decisions (fig) and problems the agents cannot fix (clay) where they get fixed. |

## The autonomy ladder

| Level | What the agents do alone | How a product reaches it | Status |
| --- | --- | --- | --- |
| **1 · Approved execution** | Everything except deciding what goes out | Default for every product and channel | Built |
| **2 · Supervised, per channel** | Approve routine drafts inside the founder's rules (channels, posts per day, quiet hours, blackout dates); optionally schedule them | Earned: Banyan proposes it per channel when the record clears the bar; the founder accepts | Built (policy + earned-autonomy proposals) |
| **2+ · Supervised publishing** | Also schedule and publish those drafts | The founder turns on auto-publishing explicitly; never proposed automatically | Built (founder-only switch) |
| **3 · Continuous cycles** | Start the next cycle from the last report, inside a budget | Needs: a measured record across several cycles, per-cycle credit budgets, sampling of auto-approved posts for review (built: spot checks), an incident log. Not before. | Not built. Not marketed. |

Moving **down** the ladder is always one click and never needs evidence: pause all agents, remove a channel, or
switch the policy back to approving each draft.

## How the record can lose trust

Earned autonomy is not permanent. The bar is checked against the latest 10 human decisions on a channel, so a
rejection, a flagged claim or a failed post puts the channel back to "not yet" for any *new* proposal. When a
supervised channel's record shows a problem (a rejection, a flagged claim, a failure; not merely a short history),
the Autonomy page marks it "Record slipped" and proposes taking the channel back, again for the founder to accept.

## Spot checks: supervision keeps being earned

Drafts the policy approves do not vouch for themselves, so on their own they would freeze a supervised channel's
record. Instead Banyan sends a sample back to the founder after the fact: the first draft it approves on a channel,
then one in every three (`spotCheckDue` in `src/lib/autonomy/trust.ts`). The founder answers "yes, as written",
"I'd have changed it" (counts as an edit) or "it shouldn't go out" (counts as a rejection, and stops the post when it
has not been published yet: the schedule is cancelled and the approval withdrawn). Those verdicts are human decisions,
so they enter the channel's record, and a "shouldn't go out" marks a supervised channel "Record slipped".

## What this rules out

- Posting from a channel the founder has not connected and approved.
- "Autonomous" marketing for anything below Level 3.
- Silent retries that could double-post, or charges for work that failed.
- Agents that change their own rules, budgets or permissions.
