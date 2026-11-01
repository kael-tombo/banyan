# MVP Blockers

Audit date: 2026-11-01, branch `mvp/socialflow-foundation` at `b7be9be`.

## The promise being tested

> **Ship one update. Get one complete distribution cycle: strategy, three channel-native assets, your approval,
> real publishing, measured results, and the next move.** — [STRATEGY.md §3](../../STRATEGY.md)

The definition of done is [STRATEGY.md §11](../../STRATEGY.md): the cycle runs **with real accounts and real
numbers** — at least two provider-confirmed live publications, one prepared video handoff, at least one recorded
visit or signup within 7 days, a next-cycle proposal, under 30 minutes of founder time, zero fabricated data, zero
unauthorized actions.

A blocker is anything that stops that scenario from running for a real founder today. Things that make the
product nicer but do not stop the cycle are not listed.

## What already holds (not blockers)

Auth and workspace isolation · URL intake and an approvable product profile (US-021–024) · structured strategy
with review/approve/reject (US-042/043) · platform-specific drafts from the approved strategy (US-044) ·
revision-specific approval that edits reset (US-050–052) · one campaign lifecycle (US-046/047) · export mode with
manual live-URL recording (US-034) · tracked links and first-party signup attribution · evidence-backed
recommendations (US-059) · credit ledger with reservations (US-055/056/062/063) · Docker Compose stack with
Postgres, Redis and a queue worker (US-001–007).

## The blockers, in the order to solve them

| # | Blocker | Breaks which part of the promise | Kind | Size |
| --- | --- | --- | --- | --- |
| [01](01-no-live-publishing-rail.md) | No verified live publishing rail | "real publishing" — ≥2 provider-confirmed posts | External + decision | L |
| [02](02-no-production-environment.md) | No production environment | Nothing runs for a real founder; OAuth needs a public HTTPS callback | Ops | M |
| [03](03-no-live-model-provider.md) | No live model provider configured | "channel-native assets" in the founder's voice | Ops + quality | S |
| [04](04-onboarding-does-not-reach-first-cycle.md) | Onboarding stops before the first campaign and publication | The cycle a new founder actually walks; <30 min | Build | M |
| [05](05-no-cycle-report.md) | No cycle report | "measured results, and the next move" as one closing artefact | Build | S |
| [06](06-no-email-delivery.md) | No email delivery | Account recovery, verification, "approval needed" reminders | Build + vendor | M |
| [07](07-claims-guard-missing.md) | No fabricated-claims / brand guard | Acceptance criterion "Fabricated data: zero" | Build | M |
| [08](08-no-activation-measurement.md) | No activation funnel | Cannot prove <30 min, <24 h to first approved asset, or activation | Build | S |
| [09](09-integration-errors-not-recoverable.md) | Integration errors not recoverable everywhere | "Every state visible… with provider response and retry history" | Build | S |
| [10](10-production-hardening.md) | Production hardening gaps | Holding real OAuth tokens safely: headers, logs, backups, CI | Ops | M |
| [11](11-no-way-to-pay.md) | No way to pay or top up credits | A paid cycle; credits run out after 50 | Build + vendor | M |
| [12](12-cycle-never-proven-end-to-end.md) | The cycle has never been proven end to end | The launch gate itself | Verification | M |

**Critical path:** 01 → 02 → (03, 04 in parallel) → 05 → 12. Blockers 06–11 can be worked alongside, but 06,
07 and 10 must land before any outside founder connects a real account.

## How to use these files

Each file has the same shape: **Problem → Evidence → Why it blocks the promise → Decision needed (if any) →
Plan, step by step → Acceptance → Dependencies → Stories.** Work them top to bottom. When one is closed, mark its
row here `✅ Closed (commit)` and update [MVP_GAP_ANALYSIS.md](../MVP_GAP_ANALYSIS.md).
