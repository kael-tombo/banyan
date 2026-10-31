# MVP Gap Analysis

The brief's release criteria (§25) against the repository as audited on 2026-11-01. Each gap maps to the stories
that close it ([USER_STORIES.md](USER_STORIES.md)).

## Product criteria

| Release criterion | Today | Gap | Stories |
| --- | --- | --- | --- |
| A new user can register | **Met** (E2E) | Email verification, password recovery | US-010, US-011, US-012 |
| A user can create a workspace | **Met** (created at signup) | Business name, industry, model, time zone | US-019 |
| A user can complete onboarding | **Partial**: 5 steps | 9-stage flow with resume, skip, brand, preferences, connection, first campaign, activation | US-018, US-020, US-026, US-038, US-039, US-040, US-041 |
| A user can submit a product URL | **Met** (cycle intake, SSRF-safe) | As an onboarding stage with a background job and progress | US-021, US-025 |
| Banyan can analyse the product | **Partial**: rule-based snapshot | Schema-validated analysis with features, problems, differentiators, missing information; prompt-injection isolation | US-022, US-024 |
| The user can approve the product profile | **Partial**: snapshot correction | Full-profile review with versioned approval | US-023 |
| Banyan can generate a distribution strategy | **Partial**: goal plans | Structured strategy (channels, rationale, formats, angles, cadence, KPIs) on verified capabilities | US-042, US-045 |
| The user can approve the strategy | **Met** for goal plans (E2E) | On the structured strategy, with versions | US-043 |
| Banyan can generate platform-specific content | **Met** (E2E) | Brand restrictions, claims guard, strategy grounding | US-044, US-054 |
| The user can edit and approve content | **Met** (E2E) | — | US-050, US-051, US-052 (Done) |
| At least one verified SocialFlow.ai publishing path works | **Not met — externally blocked** | SocialFlow.ai has no API ([audit](SOCIALFLOW_INTEGRATION_AUDIT.md)) | US-030, US-031 (buildable now), US-037 (blocked) |
| Publishing status tracked through a verified mechanism | **Partial**: provider confirmation or user-recorded URL | SocialFlow.ai status sync | US-034 (now), US-035 (blocked) |
| Campaign progress is visible | **Partial** | One lifecycle, campaign progress view | US-046, US-047, US-049 |

## Engineering criteria

| Release criterion | Today | Gap | Stories |
| --- | --- | --- | --- |
| Docker Compose starts the complete application | **Not met**: single Dockerfile | Compose with web, worker, postgres, redis, migrations | US-001, US-002, US-003, US-004, US-008 |
| Database persistence works | **Met** locally | Named volume in Compose; backups | US-001, US-068 |
| Background jobs work | **Partial**: HTTP tick polling | Redis queue and consumer | US-005, US-006 |
| Database migrations work | **Met** | One-shot migrate service | US-003 |
| Critical automated tests pass | **Met** (354 unit, 42 E2E) | MVP journey and failure suite in Docker | US-074, US-075 |
| Workspace isolation is verified | **Met** (E2E) | Extend to new endpoints as they ship | US-016 (Done) + each story's authorization test |
| Secrets are not exposed | **Partial** | Structured logs with redaction | US-064 |
| No Postiz dependency exists | **Not met** | Remove adapter, UI and claims | US-028, US-029 |
| Integration errors are recoverable | **Partial** (bounded retry exists) | User-visible cause and retry everywhere | US-069 |
| Credit accounting is consistent | **Not met**: no credits | Ledger, reservations, refunds, expiry, concurrency | US-055, US-056, US-061, US-062, US-063 |

## Business metrics

| Metric | Today | Stories |
| --- | --- | --- |
| Onboarding completion, analysis completion, connection, strategy and content approval, first publication, time to first publication, publish success rate, campaign completion | Not measured | US-057, US-058 |
| **Primary activation:** % of new users publishing their first approved content through SocialFlow.ai | Cannot be non-zero until SocialFlow.ai has an API | US-058 reports it alongside "first publication (any path)" |
| **Time to value:** product URL → first successful publication | Not measured | US-057, US-058 |

## What is already better than the brief asks

- Honest blocking when no provider is connected, and manual publications labelled as manual (E2E).
- SSRF protection on every outbound request (E2E).
- Approval re-verified on every publish attempt, including retries.
- Recommendations that say "not enough data" instead of inventing insight.

These are preserved by every story above.
