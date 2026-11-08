# 06 — No email delivery

## Problem

Banyan cannot send email. There is no email verification, no password recovery, and no "your drafts are ready
for approval" reminder.

## Evidence

- No mail client in `src/` (no SMTP, Resend, Postmark or similar).
- TECHNICAL_DEBT.md TD-12 (High): "Blocks email verification and password recovery".
- US-010 Ready; US-011, US-012, US-073 Backlog.

## Why it blocks the promise

- A founder who forgets their password loses their connected accounts and cycle. With real OAuth tokens stored,
  unverified emails also mean an account can be created on someone else's address.
- The cycle waits on the founder twice (strategy, drafts). Generation is async; without a reminder, "time to
  first approved asset < 24 h" depends on them checking back by chance.

## Decision needed (founder)

Email vendor. Recommendation: **Resend or Postmark** (simple API, good deliverability, free tier covers the MVP).
Requires DNS records (SPF, DKIM, DMARC) on the domain from blocker 02.

## Plan, step by step

1. **US-010 — transport**: `src/lib/email/` with a `send(template, to, data)` interface; vendor adapter + a
   console/dev adapter; sends go through the Redis queue with retry; every send logged without the body.
2. **Templates**: plain, text-first; verify email, reset password, approval needed, cycle results ready.
3. **US-011 — verification**: single-use token (hashed in DB, 24 h); unverified accounts can use the app but
   cannot connect a publishing account or publish.
4. **US-012 — recovery**: request always answers the same ("if that address exists…"); token hashed, 30 min,
   single-use; reset revokes all sessions; rate-limited per IP and per address.
5. **US-073 — approval reminder**: when strategy or drafts enter "waiting on founder", queue one email; at most
   one per cycle stage; unsubscribe link and a settings toggle.
6. **Tests**: token expiry, reuse, enumeration-safe responses, reminder de-duplication.

## Acceptance

- Mail from the production domain lands in Gmail and Outlook inboxes (not spam) with SPF/DKIM pass.
- A forgotten password can be reset end to end; old sessions stop working.
- Drafts finishing generation produce exactly one email.

## Dependencies

Blocker 02 (domain and DNS).

## Stories

US-010, US-011, US-012, US-073 (US-072 in-app notifications is a nice complement, not required).
