# 09 — Integration errors not recoverable everywhere

## Problem

Bounded retries exist for publishing, and analysis has a graceful failure path in review, but other failures
(model timeouts during strategy/drafts, URL fetch errors, token expiry, queue job failures) do not consistently
tell the founder what happened and what to do next.

## Evidence

- MVP_GAP_ANALYSIS.md: "Integration errors are recoverable — **Partial** (bounded retry exists) — user-visible
  cause and retry everywhere".
- US-069 Backlog; US-025 (analysis recovery) and US-049 (partial campaign failure) in Review.

## Why it blocks the promise

§11: "Every state visible — draft → approved → published/blocked/failed, **with provider response and retry
history**." With live providers (blocker 01) failures become routine: expired tokens, rate limits, duplicate
content. A cycle that silently stalls is the worst outcome for trust.

## Plan, step by step

1. **Close US-025 and US-049** — review, fix findings, merge.
2. **One error shape** for every integration: `{ code, cause (plain language), retryable, retryAt?, action }`
   where `action` is one of `retry`, `reconnect`, `edit`, `contact`, `none`. Extend `DistributionError` rather
   than adding a parallel type.
3. **Inventory** every external call — model, URL fetch, LinkedIn, X, email, queue — and map each failure class to
   that shape. Write the table into this file as it is done.
4. **UI** — a single `IntegrationErrorNotice` component used on the cycle cockpit, campaign, content and
   connections pages: cause, last attempt time, attempts so far, next automatic retry, and the action button.
5. **Credits** — confirm every failure path releases reserved credits (ledger already supports `release`); add a
   test per path.
6. **Failure-path tests** feed blocker 12 (US-075).

## Acceptance

- Kill the model provider mid-generation → founder sees "Draft writing failed — retry" with credits returned.
- Revoke the LinkedIn token → "Reconnect LinkedIn" on the blocked post; after reconnecting, retry publishes.
- No stage can sit in a running state forever: stuck jobs are swept and surfaced (maintenance sweep exists).

## Dependencies

Blocker 01 for provider-specific cases.

## Stories

US-025, US-049, US-069.
