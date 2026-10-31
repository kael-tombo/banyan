# SocialFlow.ai — Integration Audit

Audit date: 2026-11-01. Supersedes the discovery section of [SOCIALFLOW_INTEGRATION.md](SOCIALFLOW_INTEGRATION.md)
(2026-10-28), which checked only the public web. This audit adds the SocialFlow.ai source repositories found on
the development machine.

**Verdict: no SocialFlow.ai capability is verified. There is no running or runnable SocialFlow.ai API that can
connect social accounts, publish, schedule, report status or return analytics.** Per the brief ("Only verified
capabilities can be treated as implemented dependencies"; "Never invent endpoints or response schemas"), Banyan
does not call SocialFlow.ai in production. It ships the contract it needs (below), an adapter tested against that
contract with mocks, and an honest export mode.

---

## 1. Sources inspected

| Source | What was found |
| --- | --- |
| `https://socialflow.ai` (2026-10-28) | Parked domain listed for sale; no product, no developer docs |
| Web search for SocialFlow.ai API docs (2026-10-28) | Only unrelated namesakes |
| `C:\Users\All in one\ShipStudio\socialflow-ai` | Only a `.clone-staging` copy of an older frontend; no backend |
| `C:\Users\All in one\ShipStudio\socialflow-ai-2` (git `armand-ratombotiana/SocialFlow.ai`, last commit 2025-11-21) | The current SocialFlow.ai repository. Details below |
| MCP tools in this session | None for SocialFlow.ai |

### `socialflow-ai-2` in detail

- **README (release 1.1.0):** "This is a local planning release. AI generation, social login, automatic
  publishing, media uploads, analytics, collaboration and billing are not connected." Drafts and missions live in
  browser storage. "The Java backend is not runnable from the checked-in source as supplied and is not certified
  for deployment."
- **`docs/PROJECT_ASSESSMENT.md`:** "there is no `postia-backend/pom.xml`; the API POM references missing
  `postia-admin`, and analytics has build artifacts without source/POM … No checked-in Flyway migration was found."
- **Backend modules (Java source files):** `postia-auth` 36, `postia-content` 20, `postia-core` 20, `postia-api` 1,
  `postia-analytics` 0, `postia-billing` 0, `postia-media` 0, `postia-notifications` 0.
- **Declared endpoints** (source only; cannot be built or run):
  - `AuthController` `/api/v1/auth`: `login`, `register`, `password/reset`, `password/confirm`, `email/verify`,
    `refresh`, `logout`, `logout-all`, `profile`, `password/change`, `2fa/*`.
  - `PostController` `/api/v1/posts`: create, update, get by id / slug / author / `my` / status,
    `{postId}/publish`, `{postId}/schedule`, delete.
  - `publish` and `schedule` change a post's state inside SocialFlow's own content store. **No module connects to
    a social platform**: there is no account-connection, platform OAuth, media or delivery code in the backend.
    A `LinkedInAuthProvider.ts` exists only in the retained, uncompiled prototype frontend.

---

## 2. Capability matrix

| Capability | Status | Evidence |
| --- | --- | --- |
| Authentication (machine-to-machine, for Banyan) | **Missing** | Only end-user JWT login is declared, in an unbuildable backend; no API keys or OAuth client flow for integrators |
| Account connection (social platforms) | **Missing** | No platform OAuth in the backend; README: "social login … not connected" |
| Account discovery | **Missing** | No accounts endpoint |
| Publishing to a social platform | **Missing** | `/posts/{id}/publish` changes internal state only; README: "automatic publishing … not connected" |
| Scheduling | **Missing** | `/posts/{id}/schedule` is internal state; no scheduler or delivery |
| Status synchronisation | **Missing** | No delivery, so no external status |
| Webhooks | **Missing** | None declared |
| Analytics | **Missing** | `postia-analytics` has no source |
| Media handling | **Missing** | `postia-media` has no source |
| Base URL / versioning | **Missing** | `/api/v1` prefix is declared but nothing is deployed |
| Rate limits, error model | **Missing** | Not documented |
| Multi-tenant isolation, token storage responsibility | **Missing** | Not documented |

No row is "Verified". Therefore none of these may be treated as an implemented dependency.

---

## 3. What Banyan needs from SocialFlow.ai (the integration contract)

This is the contract Banyan's adapter is written and contract-tested against. It is **Banyan's requirement**, not a
description of an existing SocialFlow.ai API. It is deliberately small. The machine-readable version is
`src/lib/distribution/socialflow/contract.ts` (built in the SF epic).

| # | Operation | Purpose | Minimum shape |
| --- | --- | --- | --- |
| C1 | Authenticate Banyan | Server-to-server auth per Banyan workspace | API key or OAuth client credentials, scoped to one SocialFlow organisation |
| C2 | Start account connection | Send the founder to SocialFlow to connect X / LinkedIn / … | Returns a connect URL; SocialFlow owns platform OAuth and token storage |
| C3 | List connected accounts | Show accounts and their identifiers in Banyan | `[{ id, platform, handle, status, capabilities[] }]` |
| C4 | Get capabilities | Only offer what an account supports | per account: `publish`, `schedule`, formats, character limits, media rules |
| C5 | Publish now | Execute an approved post | input: account id, text, optional media refs, **idempotency key**; output: SocialFlow post id + status |
| C6 | Schedule | Publish later | as C5 plus `scheduled_at` (UTC) |
| C7 | Get status | Truth about delivery | `queued / scheduled / published / failed` + platform URL + error |
| C8 | Webhook (optional) | Push status changes | signed payload (HMAC) with post id, status, URL |
| C9 | Analytics (optional) | Learning loop | per post: impressions, clicks, engagement, with timestamps |
| C10 | Revoke | Disconnect an account | delete connection; later calls return an explicit `revoked` error |
| — | Errors | Recovery | typed codes: `auth_failed`, `revoked`, `rate_limited` (+ `retry_after`), `unsupported_format`, `validation`, `provider_unavailable` |

**Responsibility split:** SocialFlow.ai owns platform OAuth, platform tokens, delivery, platform rate limits and
platform analytics. Banyan owns product intelligence, strategy, content, approval, orchestration, idempotency keys,
the audit trail and the credit ledger. Banyan never stores platform tokens.

---

## 4. What ships in the MVP while SocialFlow.ai has no API

1. **Contract-tested adapter**, disabled by default. `SocialFlowAdapter` implements Banyan's `DistributionProvider`
   interface against the contract above, with mocked HTTP contract tests for every success and failure path. It is
   enabled only when `SOCIALFLOW_API_URL` and credentials are configured **and** a live smoke test (`npm run
   smoke:socialflow`) passes; until then the capability registry reports it as `unavailable`.
2. **Export mode (the live distribution path).** Approved content becomes a channel-formatted package (copy, video
   script, checklist) the founder executes in any tool, then records the live URL. The publication is stored as
   `manual: true`, never as a provider confirmation. This already works (E2E) and is promoted from a side feature to
   the MVP's default path.
3. **Honest UI.** Banyan never shows a SocialFlow account as connected and never shows a post as published by
   SocialFlow.ai until the adapter is live.

## 5. Handoff to the SocialFlow.ai team (to unblock the activation metric)

To let Banyan meet the brief's primary activation metric ("publish the first approved piece of content through
SocialFlow.ai"), SocialFlow.ai needs, in order:

1. A buildable, deployable backend (root `pom.xml`, migrations, one supported deployment).
2. C1, C2, C3, C5 and C7 for **one** platform (X or LinkedIn), with real platform OAuth.
3. A sandbox or test account Banyan can run its smoke test against.
4. Then C6, C4, C10, C8 and C9.

When (2) and (3) exist: record base URL, auth, request and response samples, error codes and rate limits in this
file, flip the matrix rows to Verified with evidence, run `npm run smoke:socialflow`, and enable the adapter. No
Banyan intelligence, content or approval code changes.
