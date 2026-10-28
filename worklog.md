# Worklog

Chronological record of changes. Newest entries at the bottom.

---

## 2026-10-27 — Repository audit and repair

**Starting point.** A substantial but non-compiling Banyan.ai MVP: Next.js 15 +
Prisma/SQLite, domain layer and API routes largely written, no tests, no README.

### `fc87ce4` — fix: make the project compile and stop rendering unstyled

The project had 39 TypeScript errors, and two of them were real runtime defects
rather than type noise:

- The body-parsing helper inferred a schema's **input** type instead of its output,
  and routes called it with an already-parsed body while it tried `req.json()` —
  every POST/PATCH route would have thrown.
- `src/app/layout.tsx` never imported `globals.css`, so **no page had any CSS**.
  The whole app rendered as unstyled text.

Also corrected wrong Prisma query shapes (`Publication` is reached via
`contentItem`, not a `workspaceId` column), a missing `"metric"` activity type, and
several prop/type mismatches in forms.

### `c2cca70` — feat: restore tracked links, seeding and the publishing worker

The measurement loop was dead: `trackedLinkUrl()` pointed at `/t/[slug]`, which had
no route, and `recordClick()` was never called. Added the redirect route (records
the click, sets the visitor cookie for attribution, restricts redirects to
http/https), the missing `prisma/seed.ts` (so `npm run setup` works, and Banyan has
its own self-distribution workspace), and `worker/index.ts` (so `npm run worker`
works).

### `6159861` — feat: add the dashboard pages that were linked but missing

`/app/approvals`, `calendar`, `publishing`, `analytics`, `experiments`, `settings`,
`growth` and `content/new` were referenced from the navigation and dashboard but did
not exist — dead links throughout the app. All implemented against real queries.

### `d6057e7` — test: add unit tests for the pure domain logic

Vitest configuration plus 32 tests covering workflow state machines, channel/format
validation, experiment summaries, secret encryption, rate limiting and AI output
schemas.

### `7a83579` — docs: add README and implementation report

Setup, architecture, routes, and an honest status report that separates what works
from what is unverified.

### `e6fbccb` — feat: make onboarding optional instead of a gate

New accounts were redirected out of the app until a six-step onboarding form was
finished, which blocked the product behind setup. Everyone now lands in the app;
an in-app prompt and a "Skip for now" link in the wizard guide setup without
preventing use.

### `d7a3acc` — feat(ui): group navigation, add a mobile menu and page states

Eleven flat nav items became three groups (plan / distribute / measure), with a
real collapsible mobile menu replacing a cramped horizontal strip. Added a skip
link, a loading skeleton, a recoverable error boundary, automatic label-to-control
association for form fields, and a confirmation before deleting an insight.

### Verified after each change

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass (0 errors, was 39) |
| `npm test` | Pass — 32 tests |
| `npm run build` | Pass — 48 routes |
| `npm run setup` | Pass — migration + seed |
| Runtime smoke | Public routes 200; protected → redirect to login; tracked link records a click; all authenticated pages 200; styled output confirmed in the browser |

---

## 2026-10-28 — Bounded retry policy for publications

### feat: retry transient publication failures with backoff (commit pending)

Before this change, any provider hiccup permanently failed the publication and
the content — a 30-second Postiz outage or one 429 killed a scheduled post for
good, with the user left to notice and restart it by hand.

- **`src/lib/publishing/retry.ts` (new)** — pure retry policy: transient vs
  permanent classification, `MAX_PUBLISH_ATTEMPTS = 4`, exponential backoff from
  one minute capped at thirty, deterministic 15% jitter, explicit provider
  `Retry-After` honored but also capped. Unknown errors are permanent by
  default — a retry must be a conscious policy decision, not a default.
- **Postiz adapter** now classifies HTTP statuses (408/429/5xx transient; other
  4xx permanent), parses `Retry-After`, and marks its own network/timeout
  failures transient. `PublishResult` gained `retryable` / `retryAfterMs`.
- **`executePublication`** on a transient failure reschedules the publication
  and rolls the content back to `scheduled` (a state-machine extension:
  `publishing → scheduled`), so the worker re-attempts it through the *same*
  guarded path — approval is re-verified and the duplicate-publication check
  still applies. Retries keep the existing publication row (same
  `idempotencyKey`), never create a second one.
- **Terminal after four attempts**: `publication_failed` with the full attempt
  count in the audit summary.
- **12 new tests** (44 total): classification of transient classes, the
  attempt cap, exponential growth, the cap, `Retry-After` handling, and jitter
  bounds.

Known limitation recorded honestly: a retry after a partial provider success
(e.g. the post landed but the response was lost) could duplicate a post, because
Postiz's public API offers no verified idempotency token. The bounded attempt
cap keeps the blast radius small; a dedup-by-`group` probe against a live
account remains the real fix.
