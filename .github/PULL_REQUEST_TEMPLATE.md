<!--
Banyan PR checklist — every claim below should be verifiable from checks you actually ran.
-->

## What & why

<!-- One paragraph: the change and the problem it solves. Link the issue/audit item if any. -->

## Honesty rules touched?

<!-- Check any that apply; explain how the change respects them. -->

- [ ] Publishing/approval flow (`isExportableContent`, approval gates)
- [ ] Metrics/results display (no fabricated outcomes; honest zeros / "not enough data")
- [ ] Provider responses or fallback labeling (`isFallback`, `providerResponse`)
- [ ] Business-context provenance (verified / user_provided / external / hypothesis)
- [ ] None of the above

## Quality gates run

- [ ] `npm run typecheck` — clean
- [ ] `npm test` — all passing (no skipped/weakened assertions)
- [ ] `npm run build` — compiles
- [ ] Schema change → additive migration verified on a fresh DB
- [ ] Behavior change → `scripts/e2e-acceptance.sh` run against a live server
- [ ] UI change → checked at 1440px and 390px

## Security checklist

- [ ] All queries workspace-scoped (`workspaceId`); foreign IDs 404
- [ ] User-supplied URLs fetched only via `safeFetch`
- [ ] Mutating bodies via `readJson` (512 KB cap + zod)
- [ ] No secrets in code, logs, responses, or client-visible errors
- [ ] Side effects idempotent (dedupe/idempotency keys) where retries are possible

## Docs updated

- [ ] `README.md` / `docs/*` / `progress.md` / `worklog.md` / `CHANGELOG.md` as applicable
