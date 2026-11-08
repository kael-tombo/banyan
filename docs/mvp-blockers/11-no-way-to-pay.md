# 11 — No way to pay or top up credits

## Problem

Drafts now cost credits and every workspace gets 50 once. There is no way to buy more, no monthly grant and no
subscription. A founder who uses their 50 credits is stuck; Banyan cannot earn its first dollar.

## Evidence

- `src/lib/credits/ledger.ts`: `STARTER_GRANT = 50`; `grant` kind exists but only the starter grant is issued.
- No Stripe or other billing code in `src/`; `growth-loop.ts`: "No billing integration exists today."
- US-061 (monthly grants, expiring batches) Backlog. STRATEGY.md §10: "Billing and quotas, if the cycle is paid —
  **Not built**". Appendix C gate for days 22–28: "First paid workspace".

## Why it blocks the promise

For design partners (free, supervised) it is not blocking — grant credits by hand. For the paid MVP it is: the
value is "a completed cycle", and the credit wall arrives inside the second cycle.

## Decision needed (founder)

Pricing to start with. STRATEGY Appendix C hypothesis: Starter $29/mo (1 product, 30 assets/mo) and Pro $79/mo.
Decide how many credits a plan grants per month and whether one-off top-ups exist. Vendor recommendation:
**Stripe Checkout + Customer Portal** (no card data touches Banyan).

## Plan, step by step

1. **Interim (now)**: an operator script `npm run credits:grant -- <workspace> <n> "<reason>"` writing an
   `adjust`/`grant` entry, so design partners are never blocked.
2. **US-061 — grants and expiry**: credit batches with `expiresAt`; monthly grant per plan; `expire` entries by the
   maintenance sweep; spend oldest-expiring first. Tests for expiry under concurrent reservations.
3. **Plans** table/config: plan id, monthly credits, limits (products, live channels).
4. **Stripe**: Checkout session for a plan; webhook (`checkout.session.completed`, `invoice.paid`,
   `customer.subscription.updated/deleted`) verified by signature, processed idempotently via the event id as the
   ledger idempotency key; Customer Portal link on `/app/credits`.
5. **Downgrade/cancel**: keep remaining credits until period end; never delete content.
6. **Honest UI**: the credit estimate on a strategy already shows cost; when short, show "You need 6, you have 2
   — upgrade or top up" instead of only refusing.
7. **Test mode first**; switch to live keys only after a full purchase → grant → spend → renewal run.

## Acceptance

- A founder can buy Starter, sees the credits immediately, and the ledger shows the Stripe event as the source.
- Replaying the same webhook grants nothing extra.
- A renewal grants the next month; expired credits are visible as `expire` entries.

## Dependencies

Blocker 02 (public webhook URL). Credit ledger (done).

## Stories

US-061 · new story: "Subscribe and pay with Stripe".
