# Philosophy

Beliefs about how Banyan.ai should behave, and — more importantly — where each one
is enforced in the code, so it is a property of the system rather than a good intention.

## Product beliefs

### 1. Never fabricate an outcome

Invented traction destroys the only thing a distribution tool sells: trust in its
numbers. Every number on screen comes from a real row.

*Enforced in:* analytics and dashboard queries read only stored records; empty states
explain true zeros versus uncollected data; `MetricObservation` values record their
source (`provider` | `manual`).

### 2. A human approves anything consequential

Automation that can post under your name without consent is not a feature.

*Enforced in:* `isExportableContent()` in `src/lib/state-machines.ts` — publishing
refuses any item without a status of `approved`/`scheduled` **and** a recorded
`approvedById`. Editing approved copy resets it to draft.

### 3. Uncertain outcomes must be representable

A provider timeout is not a failure and not a success. The model needs a word for
"unknown".

*Enforced in:* `Publication.status` (`scheduled` | `attempting` | `published` |
`failed` | `blocked`), idempotency keys, and attempts that record the raw provider
response for reconciliation.

### 4. Missing configuration is a state, not an error

A founder without a Postiz account should still be able to do everything up to the
moment of publishing.

*Enforced in:* publication attempts without a connection are recorded `blocked`
with actionable messaging, and content returns to `approved` rather than failing
silently.

### 5. Model output is labelled output

If no model credentials are configured, the generator must not pretend.

*Enforced in:* `TemplateFallbackProvider` — deterministic template drafts, always
surfaced with `isFallback` and a label, never presented as live model output.

## Engineering beliefs

### 6. Server-side authorization, always

The UI is a view, not a security boundary.

*Enforced in:* every route resolves the workspace through `requireWorkspace()` and
scopes queries by `workspaceId`; the edge middleware only checks cookie presence.

### 7. Validate at the boundary, in one place

*Enforced in:* one body-parsing helper in `src/lib/api-utils.ts` that infers the
schema's **output** type, so validation errors become 400s instead of 500s.

### 8. Secrets never reach the client

*Enforced in:* AES-256-GCM encryption at rest (`src/lib/crypto.ts`); connection
credentials are decrypted only server-side; the API returns `hasKey`, never the key.

### 9. No dead buttons

A control that cannot work must not look like it works.

*Enforced in:* every nav and dashboard link resolves to a real page; disabled
controls explain themselves; blocked publishing explains exactly what is missing.

### 10. Failures and emptiness are moments for direction

An error should say what happened and what to do next; an empty screen should be an
invitation to act.

*Enforced in:* the app-wide error boundary, useful empty states on every list, and
interface copy that names the next step.

### 11. Smallest architecture that preserves the vision

A modular monolith plus one worker. No microservices, no vector database, no
broker, until a real requirement justifies them.

### 12. Own it before you sell it

Banyan.ai's own workspace is seeded with real product context and a real starter
campaign — not a special case, and not decorated with fake results.

*Enforced in:* `prisma/seed.ts` (workspace `banyan-ai`, `isSelf: true`) and the
in-app `/app/growth` page, which advances its milestones only on observed data.
