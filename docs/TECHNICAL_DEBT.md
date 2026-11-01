# Technical Debt Register

Recorded 2026-11-01 during the Phase 0 audit. Severity: **High** blocks the MVP or risks data/money · **Medium**
hurts reliability or operations · **Low** cleanup.

| ID | Debt | Severity | Impact | Fix (story) |
| --- | --- | --- | --- | --- |
| TD-01 | Rate limiter is an in-process `Map` | High | Limits reset on restart and are not shared across instances; brute-force protection weakens behind more than one replica | Redis-backed limiter (US-007) |
| TD-02 | Worker polls an HTTP tick every 60 s | Medium | Up to 60 s latency; no backpressure; no visibility of queued work | Redis job queue (US-005, US-006) |
| TD-03 | No Docker Compose | High | Environment is not reproducible; the brief's release criteria require it | US-001 – US-004 |
| TD-04 | Postiz adapter, connection UI and landing-page claims | High | Forbidden by the brief; landing page claims a publishing path that will be removed | US-028, US-029 |
| TD-05 | Campaign lifecycle split across four state machines | Medium | No single place answers "where is this campaign?"; brief's 12-state lifecycle not representable | US-046 |
| TD-06 | Product snapshot is rule-based HTML extraction | Medium | Misses features, problems solved, differentiators; no `missing_information` | US-022, US-023 |
| TD-07 | Untrusted page text enters prompts without explicit isolation | High (security) | Prompt-injection risk from crawled websites | US-024 |
| TD-08 | Text `console.*` logging | Medium | Hard to search; secrets redaction not centralised | US-064 |
| TD-09 | Global npm `legacy-peer-deps=true` silently dropped `vite` | Low | Test runner failed to install | **Fixed** in this branch (explicit devDependency) |
| TD-10 | Unused landing components (`LivingTree`, `VascularTree`, `WorkflowFlow`, `branches`, `Sparkline`) | Low | Dead code, larger review surface | US-070 |
| TD-11 | About 37 uppercase-tracked labels across individual app pages | Low | Visual inconsistency after the studio redesign | US-071 |
| TD-12 | No email delivery capability | High | Blocks email verification and password recovery | US-010, US-011, US-012 |
| TD-13 | No funnel metric definitions | Medium | The brief's activation and time-to-value metrics cannot be reported | US-057, US-058 |
| TD-14 | Hydration warning `<html style>` in the Ship Studio preview | Low | Comes from the preview harness injecting a style attribute, not from app code; does not occur in a plain browser run | Monitor |
| TD-15 | `Dockerfile` uses Node 20; local dev uses Node 22 | Low | Runtime drift between dev and image | US-002 |
| TD-16 | `.next` dev artefacts and `node_modules` live inside a OneDrive-synced folder | Low | Sync churn and disk pressure on the dev machine | Document in README (US-004) |
| TD-17 | `ModelCall.workspaceId` has no `onDelete: Cascade` | Medium | Deleting a workspace fails with a foreign-key error once it has any model usage (found 2026-11-01 while cleaning up a test workspace); blocks account deletion | Add cascade (or archive usage rows) with US-015 |
