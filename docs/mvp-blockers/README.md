# MVP Blockers

Audit date: 2026-11-01, branch `mvp/socialflow-foundation` at `b7be9be`. **Status updated 2026-11-02** (see the Status column and the notes below the table).

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
| [01](01-no-live-publishing-rail.md) | No verified live publishing rail — **SocialFlow Lite built; Banyan tested against it in CI over REST and MCP (stand-in LinkedIn/X); status sync, cancel and no-double-post done. Needs hosting, developer apps, one live post** | "real publishing" — ≥2 provider-confirmed posts | Ops + vendor apps | M |
| [02](02-no-production-environment.md) | No production environment | Nothing runs for a real founder; OAuth needs a public HTTPS callback | Ops | M |
| [03](03-no-live-model-provider.md) | No live model provider configured — **eval built and prompts tuned on a dev model: 10/10 products clean, 0 invented claims, < $0.001 per cycle. Needs the production provider + spend cap** | "channel-native assets" in the founder's voice | Ops + quality | S |
| [04](04-onboarding-does-not-reach-first-cycle.md) | Onboarding stops before the first campaign and publication — **✅ onboarding is the first cycle (URL → 360° read of product and market → cycle, see [ONBOARDING_360.md](../ONBOARDING_360.md)); checked in the CI journey; screens checked with live data, not clicked through signed in** | The cycle a new founder actually walks; <30 min | Build | M |
| [05](05-no-cycle-report.md) | No cycle report — **✅ built (not browser-checked; product signups need a pixel)** | "measured results, and the next move" as one closing artefact | Build | S |
| [06](06-no-email-delivery.md) | No email delivery | Account recovery, verification, "approval needed" reminders | Build + vendor | M |
| [07](07-claims-guard-missing.md) | No fabricated-claims / brand guard — **✅ claims gate enforced at approval (brand disclosures pending)** | Acceptance criterion "Fabricated data: zero" | Build | M |
| [08](08-no-activation-measurement.md) | No activation funnel — **✅ built (`npm run report:activation`; active time not measured)** | Cannot prove <30 min, <24 h to first approved asset, or activation | Build | S |
| [09](09-integration-errors-not-recoverable.md) | Integration errors not recoverable everywhere — **✅ one plain status + next step per post on every page; failed posts and broken connections counted in the rail; Retry works; crashed-run credits returned; template drafts free** | "Every state visible… with provider response and retry history" | Build | S |
| [10](10-production-hardening.md) | Production hardening gaps — **✅ buildable part done: CI (5 jobs), security headers, role guards, redacted JSON logs, backup/restore scripts, dependency audit (critical; 2 highs logged TD-18/19), no default seed password in production. Remaining: schedule backups off-box on the real host** | Holding real OAuth tokens safely: headers, logs, backups, CI | Ops | M |
| [11](11-no-way-to-pay.md) | No way to pay or top up credits — **interim done: `npm run credits:grant` with a traceable ledger entry. Stripe needs an account** | A paid cycle; credits run out after 50 | Build + vendor | M |
| [12](12-cycle-never-proven-end-to-end.md) | The cycle has never been proven end to end — **automated journey now runs in CI on every push against a production build (148 checks over HTTP); a real cycle with real accounts and design partners remains** | The launch gate itself | Verification | M |

**Needs the founder (cannot be built from here):** host + domain (02), LinkedIn and X developer apps (01), model API key and spend cap (03), email vendor (06), Stripe account (11).

**Critical path:** 01 → 02 → (03, 04 in parallel) → 05 → 12. Blockers 06–11 can be worked alongside, but 06,
07 and 10 must land before any outside founder connects a real account.

## How to use these files

Each file has the same shape: **Problem → Evidence → Why it blocks the promise → Decision needed (if any) →
Plan, step by step → Acceptance → Dependencies → Stories.** Work them top to bottom. When one is closed, mark its
row here `✅ Closed (commit)` and update [MVP_GAP_ANALYSIS.md](../MVP_GAP_ANALYSIS.md).
