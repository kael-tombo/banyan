# Banyan × SocialFlow.ai — Distribution Integration

Status of the SocialFlow.ai integration: **integration boundary + documented
manual handoff — no API client exists, because no API could be verified.**
Written against the Banyan × SocialFlow.ai integration directive. Every claim
below carries its evidence.

---

## 1. Verification result (the facts)

Per the directive — *"First, inspect SocialFlow.ai's actual integration
documentation… Do not assume API capabilities based solely on its frontend"* —
this is what was found on **October 28, 2026**:

| Checked | Method | Result |
| --- | --- | --- |
| `https://socialflow.ai` | Direct fetch | **Parked domain, listed for sale** ("make an offer"). Shows hypothetical use cases ("AI Social Scheduler & Ideator", "Brand Growth Engine") — not a product. No developer resources. |
| Developer portal / API docs | Web search (`SocialFlow.ai API documentation`, `developers…`, `publish schedule posts API`) | **Nothing for this product.** Hits are unrelated namesakes: "Social Flow" (a Claude Code content plugin), SocialFlow (legacy media-industry publisher), an open-source desktop tool, and other unrelated scheduling APIs (Social Champ, bundle.social, Ayrshare…). |
| Auth model, endpoints, media formats, platform coverage, rate limits, error behavior | — | **Not available.** Nothing to verify against. |

**Decision (per the directive's scope-control rule):** no API client was
implemented and none will be claimed. Inventing endpoint paths or simulating
a provider would violate Banyan's honesty rules. Instead: the integration
**boundary is complete**, the **manual handoff is real and useful**, and the
**activation checklist** below makes a future API integration a
connector-only change.

## 2. Responsibility boundaries (implemented)

**Banyan owns** (all live today): product/brand analysis · audience &
positioning research · distribution strategy · channel/format prioritization ·
content ideas, hooks, scripts, campaign concepts · asset generation ·
experiment design · distribution planning · performance interpretation ·
recommendations.

**SocialFlow.ai would own** (once an API exists): connected account access ·
platform-specific publishing · scheduling · media delivery · publishing
status · supported analytics.

**Nothing is duplicated**: Banyan has no social scheduler. Scheduling inside
Banyan (`POST /api/content/[id]/schedule`) is a *queue for the publishing
worker* of configured providers, not a social-media management surface; with
no provider connection it ends in an honest `blocked`.

## 3. The integration boundary

```
Banyan intelligence (goals, strategy, content, experiments)
        │
        ▼
PublishingAdapter (src/lib/publishing/types.ts)   ← vendor-neutral contract
  ├─ postiz      → implemented, verified against Postiz public API
  ├─ socialflow  → NOT implemented: no verifiable API (this document)
  └─ manual      → always available (user records the live URL)
        │
        ▼
Capability registry (src/lib/capabilities/registry.ts)
  └─ socialflow → status "unavailable", detail cites the evidence + handoff
```

Concrete pieces shipped:

- **`src/lib/publishing/socialflow.ts`** — the boundary module:
  - `SOCIALFLOW_REQUIRED_CAPABILITIES` — the exact capability contract
    Banyan needs from a SocialFlow.ai API (channels x/linkedin/shortvideo,
    immediate publish, schedule, metrics, external URLs);
  - `buildSocialFlowHandoff()` / `socialflowHandoffToText()` — the manual
    handoff package (pure, unit-tested, no network, no DB);
  - documented activation path for a future `SocialFlowAdapter`.
- **`GET /api/content/[id]/handoff`** — workspace-scoped, read-only. Returns
  `{ handoff, text, approved, itemStatus }`. Never publishes, never calls a
  provider. Cross-tenant ids → 404.
- **Editor UI** — "SocialFlow.ai handoff (manual execution)" on every content
  item: copies the channel-formatted package (copy, video script extras,
  channel notes, checklist) to the clipboard, and states plainly that
  approval is required before executing.
- **`/app/publishing` connector card** — honest status: "manual handoff only",
  with the evidence and the pointer to this document.
- **Connections API** — adapter enum still only allows `postiz`. A socialflow
  *connection* cannot be created until an adapter exists (nothing to store).

## 4. The founder journey today (directive §Required user experience)

| Directive step | Status | Where |
| --- | --- | --- |
| 1. Submit product URL | ✅ | Onboarding stores the URL as context (no live scraping in v1 — deliberate). |
| 2. Personalized distribution strategy | ✅ | Goal → plan → strategy/campaign agents. |
| 3. Generate marketing assets | ✅ | Channel/format-specific drafts, versioned, labelled. |
| 4. Select & approve an experiment | ✅ | Plan approval + per-item approval gate (recorded human decision). |
| 5. Choose accounts/platforms | ⚠️ Partial | Postiz connections for X/LinkedIn today; SocialFlow.ai accounts require its API (or manual execution). |
| 6. Prepare & submit for scheduling/publication via SocialFlow.ai | ⚠️ Manual handoff | Copy the handoff package → execute in SocialFlow.ai. The in-app schedule/publish path exists for configured providers only. |
| 7. See actual execution status | ✅ (honest) | Publication audit trail; blocked/failed/published only as evidenced. |
| 8. Access performance evidence | ✅ | Tracked links, first-party events, manual metrics; no invented analytics. |
| 9. Improved recommendations | ✅ | Evidence-cited recommendations with confidence + uncertainty. |

The transition from strategy to execution is one continuous flow *inside
Banyan*; the external step is a clearly-labelled copy-execute-record loop.

## 5. Execution status model (directive §Engineering requirements)

Banyan's existing state machines already implement the directive's statuses.
Mapping:

| Directive status | Banyan |
| --- | --- |
| Draft created | `ContentItem.status = draft` |
| Awaiting approval | `ready_for_review` (content) / `waiting_approval` (approval-gate task, plan approval) |
| Submitted for scheduling | Publication row created — `attempting` (immediate) or `scheduled` (future); content `scheduled` |
| Scheduled | Publication `scheduled`, worker attempts at due time |
| Published | Publication `published` — **only** after provider confirmation or a user-recorded live URL (`manual: true`) |
| Failed | Publication `failed` (terminal, reason + raw response stored); content `failed` |
| Publication status unknown | Timeout/ambiguous failures are **not** blindly retried: only explicitly-retryable classes (429/5xx/timeout/network, provider `Retry-After`) re-enter `executePublication` (≤4 attempts, jittered backoff, capped 30 min); unknown errors are terminal. Uncertainty is visible in the audit trail. |

Duplicate prevention: unique `Publication.idempotencyKey` (content+mode+minute),
active-publication guard (one in-flight publication per item), approval
re-verified on every attempt. Provider responses are stored raw
(`Publication.providerResponse`) for reconciliation — never trusted to define
state on their own.

## 6. Authorization & credential security

- The handoff endpoint resolves the workspace via `requireWorkspace()` and
  scopes by `workspaceId`; foreign ids 404. Publishing (including manual
  recording) requires the `approve`/`write` role capability — users cannot
  touch another workspace's content, accounts, or publications.
- No SocialFlow credentials exist or are stored (nothing to store until an
  API is verified). When they do: AES-256-GCM at rest, `hasKey`-only over the
  wire, server-side decryption — the same as Postiz connections today.
- All provider calls must go through `safeFetch` (SSRF guard:
  protocol/DNS/redirect/size controls) — non-negotiable for the future
  adapter, already the case for Postiz.

## 7. Learning loop honesty

- **Genuine data only**: tracked-link clicks, first-party funnel events,
  manual metric entry, provider-confirmed publications. Banyan distinguishes
  content creation → publication → engagement → website traffic → acquisition
  and never infers conversions it cannot measure.
- Manual publications are recorded **as manual** (`manual: true`, user
  -confirmed URL) — visible in the audit trail and analytics labels.
- If SocialFlow.ai later exposes engagement analytics, it enters through the
  adapter's `metricsSupported()` surface and lands in `CampaignMetric` with
  `source: "provider"` — clearly separated from manual entries.
- Evaluators say "not enough data" instead of inventing insight; empty
  evidence forces recommendations to `low` confidence.

## 8. Activation checklist (when SocialFlow.ai ships a real API)

1. **Verify the docs**: base URL, auth (key/OAuth), account-listing,
   post-create/schedule, status, media upload, analytics, webhooks, rate
   limits, error taxonomy. Record the evidence in this file (table in §1).
2. **Implement `SocialFlowAdapter implements PublishingAdapter`**
   (`src/lib/publishing/socialflow.ts`): `capabilities()`,
   `validateConnection()`, `publish()`, `checkStatus()` — only what the docs
   actually support; unsupported methods stay absent, never simulated.
3. **Register** it in `adapters` (`src/lib/publishing/publish.ts`) and allow
   `"socialflow"` in the connections API zod enum (`src/app/api/connections/route.ts`).
4. **All outbound calls through `safeFetch`**; store config encrypted
   (existing `ChannelConnection` machinery handles this).
5. **Wire analytics** (if offered) via `metricsSupported()` → `CampaignMetric`
   (`source: "provider"`).
6. **Flip the capability registry** entry from `unavailable` to
   `needs_credentials`/`unverified` → `available` after a live call succeeds.
7. **Tests**: adapter unit tests against mocked HTTP; extend
   `scripts/e2e-acceptance.sh` only when credentials exist for a live check.
8. **Docs**: update this file, README connector table, AGENTIC_RUNTIME.md
   unavailable list, CHANGELOG.

No changes are needed in goals, agents, content, experiments, or the UI
publish flow — that is the point of the boundary.

## 9. What was intentionally NOT built

- A SocialFlow API client on guessed endpoints (fabrication).
- Any social-media scheduler UI inside Banyan (directive: do not rebuild).
- Platform coverage expansion beyond the verified Postiz X/LinkedIn path.
- Fictitious "connected" states, simulated provider responses, or automated
  analytics that cannot be observed.

## 10. Acceptance criterion — current answer

> A founder can move from a Banyan-generated distribution recommendation to
> an approved, real publishing or scheduling operation through SocialFlow.ai,
> with truthful execution status and no unnecessary duplication.

**Met via the documented manual handoff**: recommendation → approved content →
one-click handoff package → real execution in SocialFlow.ai (or any tool) →
live URL recorded as a user-confirmed publication → evidence-based learning.
Every status shown is backed by a persisted record. When SocialFlow.ai has a
verifiable API, the checklist in §8 turns this into an automated connection
without touching Banyan's intelligence layer.
