# 01 — No verified live publishing rail

## Problem

Banyan cannot publish anything to LinkedIn or X. Postiz was removed (US-028), and its replacement, SocialFlow.ai,
has no API that connects social accounts or delivers posts. The only working path is export mode: the founder
copies the approved text, posts it by hand and pastes the live URL back.

## Status update — 2026-11-01: a working SocialFlow exists

**SocialFlow Lite** (branch [`socialflow-lite`](https://github.com/kael-tombo/socialFlow/tree/socialflow-lite) of `kael-tombo/socialFlow`) is a minimal SocialFlow.ai
built from `kael-tombo/socialFlow` (an OpenPost fork, AGPL-3.0). It implements this contract (C1–C10) for LinkedIn
personal profiles and X, text posts and threads, publish now or scheduled. This keeps the brief's
"SocialFlow.ai is the publishing provider" intact, so option A below is no longer needed.

Verified locally, end to end: Banyan's real `SocialFlowProvider`, driven by `npm run smoke:socialflow`, against the
real SocialFlow Lite binary, with stand-in LinkedIn and X servers. Every check passed: API key, account connection
through the browser flow, capabilities, publishing, no duplicate on replay, and status read back. LinkedIn received
one correctly escaped post; X received a correctly chained 2-post thread. Banyan can reach a private SocialFlow URL
only with `SOCIALFLOW_ALLOW_PRIVATE_NETWORK=true`; by default the SSRF guard still refuses it.

**What is left to close this blocker:**

1. ~~Choose where SocialFlow Lite lives~~ (done: branch `socialflow-lite`). Deploy it on a
   public HTTPS host. That host is needed for the OAuth callbacks either way.
2. Register the LinkedIn and X developer apps (step 2 below, with SocialFlow Lite's callback URLs).
3. Run `npm run smoke:socialflow -- --connect linkedin`, `-- --connect x`, then `-- --publish` against the real
   accounts. Only when that passes, set `SOCIALFLOW_VERIFIED=true`.
4. US-032: "Connect LinkedIn / Connect X" buttons in Banyan that call `connectAccount`, so founders don't need the
   script. US-035/036/060 (status sync, webhooks, analytics) stay out of scope for the MVP.

## Evidence

- [SOCIALFLOW_INTEGRATION_AUDIT.md](../SOCIALFLOW_INTEGRATION_AUDIT.md): "no SocialFlow.ai capability is
  verified"; `/posts/{id}/publish` only changes SocialFlow's internal state; no platform OAuth, delivery,
  webhooks or analytics; backend not buildable.
- `src/lib/distribution/socialflow/` — adapter tested against a contract Banyan wrote, disabled (US-031, Review).
- US-032, US-035, US-036, US-037, US-060 all **Blocked** on SocialFlow.ai.

## Why it blocks the promise

The promise says "real publishing" and §11 requires **at least two provider-confirmed publications**. A
founder-pasted URL is honest, but it is a manual publication, not one Banyan performed. Primary activation
("% of new users publishing through the provider") is structurally zero.

## Decision needed (founder)

The brief names SocialFlow.ai as the only publishing provider. That cannot be met on any date we control. Pick one:

| Option | What it means | Time | Risk |
| --- | --- | --- | --- |
| **A. Direct LinkedIn + X adapters (recommended)** | Two `DistributionProvider` implementations behind the existing provider-neutral interface; SocialFlow.ai plugs in later as a third | ~1–2 weeks | LinkedIn app review for `w_member_social` is self-serve for personal profiles; X API is pay-per-use (~$0.015/post, ~$0.20 with a URL) |
| B. Wait for SocialFlow.ai | Ship export mode only; keep "real publishing" off the landing page | Unknown | The MVP promise is not met; launch slips indefinitely |
| C. Reword the promise | "Approved, publish-ready cycle" with manual recording | 1 day | Gives up the strongest differentiator vs. AI writers |

Recommendation: **A**, while keeping the SocialFlow.ai contract and adapter so it can be enabled the day it
passes US-037. This needs an explicit founder decision because it departs from the brief.

## Plan (option A), step by step

1. **Record the decision** as an ADR in [ARCHITECTURE_DECISIONS.md](../ARCHITECTURE_DECISIONS.md): direct
   adapters as interim providers; SocialFlow.ai remains the target.
2. **Register developer apps** (founder action, needs blocker 02's HTTPS domain for callbacks):
   - LinkedIn: app with "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect"; scopes
     `openid profile w_member_social`. Personal profiles only; company pages stay out of scope.
   - X: developer project on pay-per-use; OAuth 2.0 with PKCE; scopes `tweet.read tweet.write users.read
     offline.access`.
3. **Connection flow** — `src/app/api/connections/{linkedin,x}/start|callback`: state + PKCE verifier in a
   short-lived signed cookie; tokens encrypted with the existing AES-256-GCM helper (`src/lib/crypto.ts`) into
   the connection row; refresh tokens rotated by the worker before expiry. Disconnect revokes at the provider.
4. **Adapters** — `src/lib/distribution/linkedin/` and `src/lib/distribution/x/` implementing the existing
   `DistributionProvider` interface (`src/lib/distribution/types.ts`):
   - LinkedIn: `POST /rest/posts` (author `urn:li:person:{id}`, `LinkedIn-Version` header); confirmed URL built
     from the returned `x-restli-id`.
   - X: thread = chained `POST /2/tweets` with `reply.in_reply_to_tweet_id`; record every tweet id; a partial
     thread failure is a `partial` outcome, never "published" (reuse US-049 partial-failure handling).
   - Map 401/403/429/5xx through `classifyHttpFailure` and `parseRetryAfter` so the existing bounded retry works.
5. **Capability registry** — mark each provider `verified` only after step 7 passes; until then it is listed as
   unverified and the UI keeps export mode as the default (US-033).
6. **Tests** — contract tests with recorded fixtures for both APIs: success, expired token, rate limit, duplicate
   post, thread break midway. Approval is re-checked on every attempt (existing `claim.ts`).
7. **Live smoke** (US-037 equivalent) — founder's own accounts: one LinkedIn post and one 2-tweet X thread, each
   with a tracked link; record provider response and URL. Delete the test posts afterwards by hand.
8. **Enable** the providers for all workspaces; landing copy may then say "publishes to LinkedIn and X".

## Acceptance

- A founder connects LinkedIn and X from `/app/connections`, sees the account name, and can disconnect.
- An approved LinkedIn post and X thread publish from the campaign with provider-confirmed URLs stored.
- An edit after approval blocks publishing until re-approved (existing guarantee, now tested against the real adapter).
- Expired token → visible "Reconnect LinkedIn" state, no silent failure.
- No tokens in logs, API responses or error messages.

## Dependencies

Blocker 02 (public HTTPS callback URL), blocker 10 (secret redaction before real tokens exist).

## Stories

US-027 (done, interface) · US-031, US-032, US-035, US-037 (reframed per provider) · US-033.
