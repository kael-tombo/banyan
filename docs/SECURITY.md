# Banyan — Security Posture

The security model, the controls enforced in code, and the honest list of
what is *not* protected yet. Findings history lives in
[`LAUNCH_AUDIT.md`](LAUNCH_AUDIT.md) (P0/P1 items all resolved — see
[`LAUNCH_BACKLOG.md`](LAUNCH_BACKLOG.md) for per-item verification evidence).

---

## 1. Threat model assumptions

- Users are untrusted tenants: anyone can sign up. All product/campaign/
  content/connection data is **workspace-scoped**; cross-tenant access must
  be impossible via the API.
- The browser is untrusted: cookies are the only credential; CSRF and
  oversize/overschema bodies are considered.
- Everything a user supplies — including remote provider responses and any
  future retrieved web content — is **data, never instructions**. No LLM
  prompt may elevate user content to privileged instructions, and generated
  text can never bypass authorization, validation, or the approval gate.
- Secrets (provider keys, worker secret) must never reach the browser, logs,
  or error messages.
- v1 runs single-node; the rate limiter is in-process. This is a documented
  limitation, not an assumption of safety.

## 2. Controls in place (verified)

### Tenancy & authorization
- Every API route resolves session → user → membership via
  `requireWorkspace()` and scopes **all** queries by `workspaceId`. Foreign
  IDs resolve to `404` (existence is never leaked).
- Role capability enforcement via `requireRole` — `read` / `write` /
  `approve` / `control`; `viewer` is read-only. Auth pages and connections
  management included.
- `src/middleware.ts` does a cheap cookie-presence check for `/app/*`;
  the authoritative DB-backed check always happens server-side.

### Sessions
- DB-backed sessions; the cookie stores a random token, the DB stores only
  its HMAC hash (`session.ts`) — DB read does not enable session forgery.
- Cookie flags: `httpOnly`, `sameSite=lax`, `secure` in production, 30-day
  TTL. `APP_SECRET` (32-byte hex, required) keys the HMAC.
- bcrypt (cost 12) password hashing.

### CSRF & input hardening
- `assertSameOrigin()` on every mutating route.
- `readJson()` — uniform **512 KB body cap** (content-length + raw
  byte-length) before parse, then zod validation; 25 mutating routes adopted
  (413 oversize / 400 malformed). Closes the reachable zod memory-exhaustion
  advisory without the risky zod-4 major upgrade.
- Per-route sliding-window rate limits (login/signup 10/min, AI generate
  20/min, publish 30/min, goals 10/min, facts 60/min, …).

### SSRF defense (`src/lib/net/safe-fetch.ts`)
The single choke point for server-side fetches of user-supplied URLs
(Postiz `baseUrl`):
- protocol allow-list: `http`/`https` only;
- DNS resolution + rejection of loopback, RFC-1918, CGNAT, link-local,
  cloud-metadata (`169.254.169.254`), and v6 ULA / link-local /
  v4-mapped addresses (DNS-rebinding window closed by resolving once and
  connecting to the verified address);
- manual redirects (≤3 hops), each hop re-validated;
- response size cap and no body echoing into errors or UI.
Live-verified: metadata and loopback targets are blocked with no body echo.

### Secrets at rest & in transit
- Channel connection configs are **AES-256-GCM encrypted**
  (`crypto.ts`) with `APP_SECRET`; API responses expose `hasKey` only.
- Provider calls execute server-side only; the browser never sees provider
  credentials, model keys, or raw provider responses (except intended
  status surfaces).
- `WORKER_SECRET`: bearer-only auth for `/api/worker/tick`; production
  **fails fast at boot** if it is unset or equals the dev default
  (`env.ts`, tested).
- No secrets in logs; errors returned to clients are sanitized strings.

### Action safety (the approval chain)
- Publishing refuses content without a recorded human approver
  (`isExportableContent` — approved/scheduled/publishing **and**
  `approvedById` set). Editing approved copy invalidates the approval.
- No agent task runs before the plan itself is human-approved
  (`GoalPlan.approvedById`).
- Duplicate side effects prevented structurally: unique
  `Publication.idempotencyKey` and `AgentTask.dedupeKey`, atomic
  status-guarded task claims, active-publication checks, bounded retries
  with terminal/transient classification.
- Tracked links redirect only to `http`/`https` targets.
- Root `not-found.tsx` + `global-error.tsx` — no framework-default error
  surfaces, no stack traces to clients.

### Prompt-injection posture
- Business context carries explicit provenance (`ProfileFact.provenance`:
  `verified | user_provided | external_observation | hypothesis`), rendered
  into prompts with labels.
- No live external content source is wired into prompts in v1 (no web
  scraping) — the injection class is largely absent by construction.
- Model output is always validated against declared schemas before
  persistence or execution, and fallback (template) output is labelled
  end-to-end.

## 3. Known gaps (accepted & documented for v1)

| Gap | Why accepted | Path forward |
| --- | --- | --- |
| In-memory rate limiter (single node) | MVP scale; documented | Redis-backed limiter with Postgres move (P3) |
| No ESLint/`next lint` gate | typecheck + strict TS + tests are the current bar | Add lint config to CI (P3) |
| 5 residual dependency advisories (`next@16`, `postcss` build chain, `zod@4`) | Major upgrades in the launch window are riskier than the residual exposure; the reachable zod path is closed by the 512 KB cap | Track upstream; upgrade post-launch (P3) |
| Seed account with default password | Seed-only; runbook mandates rotation/removal | Operator checklist item |
| Legal pages are template drafts | Not reviewable in-repo | Counsel review before public launch |
| SQLite single file at rest | No TDE/field-level encryption beyond connection configs | Postgres + disk/at-rest encryption when multi-node |

## 4. Reporting & handling

- Suspected vulnerabilities: open a **private** security advisory on the
  GitHub repo (do not file a public issue with reproduction details).
- Include the affected route/module and, if possible, the failing control
  from this document.
- Triage uses the DB audit trails (`TaskRun.log`, `ModelCall`,
  `Publication.providerResponse`, `ActivityEvent`) — see the runbook's
  monitoring section. Hotfix path: `docs/RELEASE_RUNBOOK.md` §8.

## 5. Secret-handling checklist for operators

1. Generate secrets with `openssl rand -hex 32`; never commit `.env`.
2. Rotate `APP_SECRET` → invalidates sessions **and** stored connection
   configs (re-enter Postiz keys afterwards).
3. Rotate `WORKER_SECRET` independently (worker-only blast radius).
4. Rotate/remove the seeded founder account before public launch.
5. Revoke any CI/deploy PAT after use; prefer fine-grained tokens with
   `Contents: Read and write` (and `workflow` scope only if pushing
   `.github/workflows/*`).
