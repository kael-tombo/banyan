# Banyan — An Honest Overview

As of 2026-11-01 · branch `mvp/socialflow-foundation` · written to be read by someone who has never seen the
project and wants the truth, not the pitch.

---

## 1. In one paragraph

Banyan is a web app for solo founders who have built a product and don't know how to get it in front of people.
You give it your product URL and one goal ("20 signups in 14 days"). It reads the page and writes a product
profile you correct and approve. Then it proposes a distribution strategy you approve, and writes three
channel-specific pieces: a LinkedIn post, an X thread and a short-video script. You approve each one. Banyan
publishes them, tracks clicks and signups through its own links, and recommends what to change in the next round.
**Every step up to publishing works today. Automatic publishing does not.** No publishing integration is live, so
the founder posts by hand and pastes the URL back. Banyan has not yet run a complete cycle with real accounts and
real numbers.

---

## 2. Vision

**"You build it. Banyan gets it out."**

The long-term idea: a founder should be able to hand off distribution the way they hand off deployment. They set
the product, the objective and the boundaries. Banyan does the coordination: research, strategy, writing,
publishing, measuring and learning. The founder's role shrinks over time from doing the work to approving
direction and handling exceptions.

The project lays this out as three stages and says plainly that only the first one is in scope:

| Stage | What it means | Status |
| --- | --- | --- |
| 1. Approved execution | Banyan proposes and executes; the founder approves the strategy and every asset | MVP target, mostly built |
| 2. Supervised autonomy | Founder sets rules (channels, cadence, topics); routine posts go out within them | Designed, not built (P1) |
| 3. Autonomous operations | Continuous distribution within budget and policy, with audit and override | Explicitly out of scope |

The name is a metaphor. A banyan tree grows from one trunk and puts down new roots where its branches touch
the ground. In the same way, one clear position spreads across many channels, and each result becomes ground to
grow from. It shapes the data model (roots = product context, trunk = plan and approvals, branches = channels,
growth rings = experiments), not the interface.

**Honest read:** the vision is clear and well bounded. The risk is ambition. "Distribution department" is a big
claim for a product that does not yet publish.

---

## 3. Philosophy

This is where Banyan is most distinctive, and where the claims are most backed by code. Most principles are
enforced in specific places, not just stated ([philosophy.md](../philosophy.md)).

| Principle | What it means in practice | Enforced? |
| --- | --- | --- |
| **Never fabricate an outcome** | Every number on screen is a stored row. A true zero and "not measured" are shown differently. | Yes: analytics read only stored records; provenance on metrics |
| **A human approves anything consequential** | Nothing publishes without a recorded approval of that exact revision; editing approved copy resets it | Yes: `isExportableContent()`, re-checked on every publish attempt and retry |
| **Uncertain is a state** | A provider timeout is "unknown", not success or failure | Yes: publication states, idempotency keys, raw provider responses stored |
| **Missing configuration is a state, not an error** | No connected account → "blocked" with an explanation, not a crash or a fake success | Yes |
| **Model output is labelled** | Without a model key, drafts come from a deterministic template that is always labelled as such | Yes: `isFallback` on every generation |
| **No unverified integration presented as available** | SocialFlow.ai is disabled because it can't be verified | Yes, and it costs the product its publishing |
| **Evidence or "not enough data"** | Recommendations cite recorded evidence or say there is none | Yes |
| **Smallest architecture that works** | One Next.js app, one worker, Postgres, Redis | Yes |
| **Banyan distributes Banyan first** | Its own workspace is the first customer | Seeded, but no real cycle has been run on it yet |

**Honest read:** this is a real asset and the main way Banyan differs from competitors. It is also why the product
looks less impressive in a demo than tools that fake it. That trade has been made on purpose, and it is the right one.

---

## 4. Features: what actually exists

### Works today (built and tested)

- **Accounts and workspaces:** email/password plus Google, Microsoft, GitHub, LinkedIn, Facebook and X sign-in;
  each workspace's data isolated on every route.
- **Product intake:** reads one public product page (with server-side request forgery protection) and builds a
  structured profile. Each field is labelled as observed, user-provided or inferred. Untrusted page text is kept
  apart from model instructions. The founder corrects and approves the profile.
- **Strategy:** a structured, cited distribution strategy (channels, rationale, angles, cadence, metric) generated
  from the approved profile. Review, edit, approve, reject or regenerate it, with versions.
- **Content:** a LinkedIn post, an X thread and a 45–60 s short-video script (hook, scenes, on-screen text,
  caption), written from the approved strategy. Editing keeps a visible history.
- **Approval gate:** per revision, enforced on the server, re-verified on every publish attempt.
- **Campaign lifecycle:** one explicit lifecycle derived from the content itself; pause, resume and cancel; a
  progress view.
- **Export mode:** copy-ready approved assets; the founder posts them and records the live URL.
- **Measurement:** first-party tracked links (`/t/<slug>`) that record clicks and attribute later signups;
  manual metrics with their source labelled.
- **Learning:** experiments, evidence-based conclusions, a recommendation for the next move, and "learning
  memory" that feeds concluded experiments into future prompts.
- **Credits:** a ledger. Draft writing is estimated before approval, held, and charged once. It is safe under
  concurrent requests. Every workspace starts with 50 credits.
- **Agent runtime:** goal → plan → tasks with persisted state, retries, crash recovery and an audit trail of every
  model call and prompt version.
- **Infrastructure:** Docker Compose (web, worker, migrate, Postgres, Redis), a Redis job queue, rate limits,
  health checks; 500+ unit tests and a 42-check end-to-end script.

### Partial

- **Onboarding** tracks nine stages but stops before the first campaign and publication.
- **AI quality:** works with any OpenAI-compatible model, but none is configured, so drafts currently come from
  the labelled template. They are grounded in the product context, but they are not in the founder's voice.
- **Results:** measurement panels exist, but no single report closes a cycle.
- **Error recovery:** bounded retries for publishing; not every failure shows its cause and a retry action yet.

### Not built

- **Live publishing to LinkedIn or X.** Postiz was removed, and SocialFlow.ai (the chosen provider) has no API.
  This is the biggest gap.
- **Production hosting.** Banyan runs locally only, and the CI workflow has not been pushed.
- **Email** (verification, password reset, approval reminders).
- **Payments** (no way to buy credits after the first 50).
- **A check for fabricated claims** in model-written drafts.
- **Team seats, notifications, images, video generation and live market research.**

The full list, with a plan for each, is in [mvp-blockers/](mvp-blockers/README.md).

---

## 5. Positioning

| | |
| --- | --- |
| **Category** | Product Distribution OS |
| **Customer** | Technical solo founders of post-launch B2B SaaS with no marketing hire |
| **Promise (MVP)** | Ship one update. Get one complete distribution cycle: strategy, three channel-native assets, your approval, real publishing, measured results, and the next move. |
| **North star** | Completed distribution cycles per active workspace per month |
| **Pricing hypothesis** | Free intake; Starter $29/mo; Pro $79/mo (untested) |

### Where it sits in the market

| Competitor type | What they do | What they leave to the founder |
| --- | --- | --- |
| Schedulers (Buffer, Postiz, Hootsuite, Metricool) | Publish and report | What to say, why, and whether it worked |
| AI writers (Jasper and similar) | Write in your voice | Publishing and outcomes |
| GTM/automation platforms (Clay, HubSpot Breeze) | Powerful workflows | Designing the workflow yourself; price |
| "AI CMO" tools | Strategy documents and agents | Execution; claims are often vague |
| Agencies | Decide and execute | Price; they don't scale down |

**The claimed gap:** nobody takes responsibility for one complete, product-aware cycle, from strategy through
approved publishing to measured outcome, at a price a founder can pay. That gap is real.

**The honest caveat:** Banyan's edge over a scheduler is the strategy and measurement layer. Its edge over an AI
writer is publishing and measurement. Today it has neither publishing nor live measurement in production. Until
it publishes, a fair comparison is "a careful AI writer with tracked links and an approval workflow." The
positioning is right. The product has to catch up to it.

### Where the marketing currently runs ahead of the product

- The landing page title and hero say **"The autonomous, agentic distribution operating system"**, and one
  section says Banyan's "autonomous agents run … the publishing". The strategy document itself rules this out:
  the MVP is Level 1, *approved execution*, and "fully autonomous" language is forbidden until Level 3. Publishing
  is not automated at all today. Suggested fix: lead with the tagline and the promise ("Ship one update. Get one
  complete cycle"), and call it "approved execution" (US-077).
- The illustrative cycle on the landing page shows LinkedIn and X posts as "Published". The page labels it
  fictional, which is honest, but it shows a capability that does not exist yet.
- The word "agentic" works for investors, not for the stated customer. Technical founders tend to discount it.

Everything else on the landing page (the approval gate, honest blocked states, the manual video handoff,
"results measured in clicks and signups") matches the code.

---

## 6. Strengths and weaknesses

**Strengths**

- Very strong integrity: approval, provenance and "not enough data" are built into the code, not just the copy.
- A bounded, testable promise with a written definition of done and kill signals.
- The engineering is solid for the stage: isolated workspaces, idempotent publishing and credits, a queue,
  tests, Docker.
- The hard parts that aren't integrations already exist: structured strategy, channel-specific drafts and
  measurement.

**Weaknesses**

- **It doesn't publish.** The central verb of the promise depends on an outside provider that doesn't exist.
- **It has never been used for real.** No design partner, no real cycle, no observed signup. Every market
  assumption (founders approve AI drafts, three formats feel distinct, $29 is right, one cycle drives renewal) is
  untested.
- **Too many surfaces for the stage.** There are about 25 app sections (opportunities, brief, audience, growth,
  experiments, calendar…) while the strategy calls for "one loop, not a suite". That is more to keep consistent and
  more for a new founder to get lost in.
- **Single dependency on a provider that can't be verified.** The brief ties publishing to SocialFlow.ai. That
  choice is blocking the MVP.
- **No production presence:** no host, email, payments or backups.

---

## 7. Where it stands against its own milestones

| Milestone | Status |
| --- | --- |
| 1. Capability: the product can run the whole loop | **Met, except live publishing** (export mode covers the gap by hand) |
| 2. Reliability: behaves correctly under real conditions | **In progress.** Well tested in development; never run in production |
| 3. Growth: real campaigns produce measurable outcomes | **Not started.** No attributed signup observed |

## 8. Bottom line

Banyan has an unusually honest product philosophy, a sharp and well-bounded MVP promise, and a codebase that
already handles most of the cycle correctly. What it doesn't have yet is the two things that make the promise
true: **posts actually going out** and **one real founder completing a cycle.** The quickest route there:

1. Decide on direct LinkedIn and X connections instead of waiting for SocialFlow.ai.
2. Deploy it.
3. Run the first real cycle on Banyan itself.

The landing page should describe the product that exists, not the one in the vision.
