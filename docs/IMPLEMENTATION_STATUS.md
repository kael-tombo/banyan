# Implementation status (multi-product brief)

Master progress file required by the brief (§20). Backlog: [user-stories/MULTI_PRODUCT_BACKLOG.md](user-stories/MULTI_PRODUCT_BACKLOG.md)
· Phase 0: [architecture/MULTI_PRODUCT_PHASE0.md](architecture/MULTI_PRODUCT_PHASE0.md) · Decision: ADR-005 in
[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).

**Backlog totals:** 72 stories — 24 DONE · 10 REVIEW · 6 IN_PROGRESS · 22 READY · 10 BLOCKED (external: email,
payments, SocialFlow media and analytics, research provider, real social accounts).

## 2026-11-01 — Phase 1/2 foundation (commit ef3a257)

| Story | Status | Files | Database | API | Tests and results | Remaining |
| --- | --- | --- | --- | --- | --- | --- |
| BOS-001 Organization | REVIEW | `src/lib/organizations.ts`, `src/lib/auth/accounts.ts`, `src/lib/bootstrap/seed-demo.ts` | `Organization`, `OrganizationMember`, `Workspace.organizationId/productType/status`; migration `20261102000000_organizations` with lossless backfill (8 workspaces → 8 orgs → 8 owners, 0 orphans; `prisma migrate diff`: no difference) | signup creates org + first product in one transaction | `scripts/multi-product-check.ts` 13/13; `tests/organizations.test.ts` | HTTP signup not yet exercised on a restarted dev server |
| BOS-003 Organization roles | REVIEW | `src/lib/organizations.ts` (`orgCan`) | — | enforced on product creation | policy table, every role × action (7 tests) | members/roles screen (with invitations; BOS-004 blocked on email) |
| BOS-008 Create products | REVIEW | `src/app/api/products/route.ts`, `src/components/ProductSwitcher.tsx` | product + membership in one transaction | `POST /api/products`: org from server context, OWNER/ADMIN only, rate-limited | isolation script; typecheck | browser check |
| BOS-009 Switch product | REVIEW | `src/lib/products.ts`, `src/lib/api-utils.ts`, `src/lib/workspace.ts`, `src/app/app/layout.tsx`, `src/app/onboarding/page.tsx`, `src/app/api/session/product/route.ts`, `src/lib/product-cookie.ts` | — | `POST /api/session/product` (404 for both missing and forbidden) | `tests/products.test.ts` (4); isolation script (forged preferences fall back) | browser check |
| BOS-010 Product authorization | IN_PROGRESS | `src/lib/products.ts`, `src/lib/api-tokens.ts` | — | every existing route through `requireWorkspace()`; MCP tokens re-check reach | isolation script | named product roles (PRODUCT_ADMIN … VIEWER) still map to today's owner/member/viewer |
| BOS-011 List and search products | REVIEW | `src/app/api/products/route.ts` (GET), `ProductSwitcher` search | — | `GET /api/products` | — | browser check |
| BOS-066 Cross-tenant security suite | IN_PROGRESS | `scripts/multi-product-check.ts` | — | — | 13/13 against Postgres | run in CI; HTTP-level IDOR cases per endpoint |

Full unit suite: 56 files, 646 tests passing; typecheck clean. Existing DB checks (`scripts/autonomy-check.ts`,
`scripts/credits-concurrency.ts`) still pass after the change, and leave no rows behind.

**Operator note:** after pulling, run `npx prisma migrate deploy` and restart running dev servers. Their in-memory
Prisma client predates the `Organization` and `ApiToken` models, so product creation and tokens fail until restarted.

## Next in dependency order

BOS-014 founder command center → BOS-010 named product roles → BOS-012/013 product settings and archive → BOS-005
organization settings → BOS-061 organization credit ledger → BOS-046/048 agent registry and tool permissions.
