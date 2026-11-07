# Launch setup: the founder's steps

Banyan is hosted on **Vercel** at `https://www.banyan-ai.app` (the bare domain redirects there). This guide is the
order that works from there to a real cycle: blockers 01, 02, 03 and 12 in `mvp-blockers/`.

What runs where:

| Piece | Where | Why |
| --- | --- | --- |
| Banyan (web + API) | Vercel (exists) | Next.js; already live |
| Postgres | The database already attached to the Vercel project | `/api/health` reports it reachable |
| Background work (scheduled posts, retries, autopilot, digests) | **Vercel Cron** or an external cron calling `/api/worker/tick` | Vercel runs no long-lived worker |
| Redis (job queue, shared rate limits) | **None on Vercel: leave `REDIS_URL` unset** | With `REDIS_URL` set, Banyan queues work for a worker. No worker runs on Vercel, so the autopilot and website analysis would never start. Without it they run in the request. Rate limits are then per serverless instance (a known gap) |
| SocialFlow Lite (LinkedIn/X publishing) | **A small server of its own** | A Go service that keeps its database on disk; it can't run on Vercel |
| Agent runtime (OpenCode) | **Off** on Vercel | Needs a long-lived Node 24 process with a volume; Banyan uses its single-call path instead |

Keep every secret in a password manager and in the hosting dashboards only. Never paste one into a chat, an issue or
a commit.

---

## 0. Do today: two checks on the live site

### 0a. The demo account

The live site runs the older `main`, which creates a demo account `founder@banyan.ai` with the password
`banyan-demopass` **unless** `SEED_USER_PASSWORD` was set when it was first seeded. The repository is public, so
that default is public. `/api/health` shows the demo account exists and is the only user.

1. Vercel → your project → **Settings → Environment Variables**: is `SEED_USER_PASSWORD` set (to something long and
   random) for Production? If yes, and it was set before the first deploy, you're fine. Skip to 0b.
2. If it isn't set, or you aren't sure, lock the account. Open your database's SQL console (Vercel → **Storage** →
   your Postgres → *Query*, or the Neon/Prisma console it links to) and run:

   ```sql
   UPDATE "User"
   SET "passwordHash" = '$2b$12$Wd1a2ryPbyEpqnsyn8S3hOzPqa843H6Ng4MNWWpLtWa03L181R/hW'
   WHERE email = 'founder@banyan.ai';
   ```

   That hash belongs to a random password that was thrown away when it was generated, so nobody can sign in as that
   account, including you. It keeps the account and its Banyan.ai workspace. Once email works (step 6), use *Forgot
   password* to set your own.
3. Then set `SEED_USER_PASSWORD` in Vercel to a long random value anyway, so a fresh database never gets the default.

### 0b. Before PR #5 is merged: production database migrations

Banyan's build runs `prisma migrate deploy` against the Vercel database **automatically**. Merging PR #5 into `main`
therefore applies **17 migrations to production** on the next deploy, including `remove_postiz` (drops the old Postiz
data) and the organizations restructure. That is intended, but do it deliberately:

1. **Back up the database first.** In your Postgres provider's console, create a backup, branch or snapshot. Neon:
   *Branches → Create branch*; Vercel Postgres and Prisma Postgres: their *Backups* tab.
2. Merge PR #5 and watch the Vercel deployment's build log for `prisma migrate deploy` → `All migrations have been
   successfully applied`.
3. Check `https://www.banyan-ai.app/api/health`: `ok` should be true and the database reachable. Redis shows as not
   configured, which is correct on Vercel (see the table at the top).

If you'd rather apply migrations by hand, set `MIGRATE_ON_BUILD=0` in Vercel before merging and run
`npx prisma migrate deploy` locally with the production `DATABASE_URL`.

---

## 1. Vercel project settings

**Settings → Environment Variables** (Production), besides what's already there:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://www.banyan-ai.app` |
| `WORKER_SECRET` | a long random value (`openssl rand -hex 24`) |
| `CRON_SECRET` | another long random value. Vercel sends it to the cron job automatically |
| `SEED_USER_PASSWORD` | long random (see 0a) |
| `AGENT_RUNTIME` | leave unset (the agent runtime doesn't run on Vercel) |

**Settings → Git:** check that the *Production Branch* is `main`.

**Settings → Domains:** `www.banyan-ai.app` primary, `banyan-ai.app` redirecting to it (already the case).

## 2. Background work

**Cron.** Banyan's maintenance sweep publishes scheduled posts, retries failures, runs the autopilot and sends the
weekly digest. Something must call it every minute or so:

- **Vercel Pro:** tell me and I'll add the cron to `vercel.json` (every minute; Vercel sends `CRON_SECRET` itself).
  On the Hobby plan Vercel rejects crons that run more than once a day, and the deploy would fail.
- **Vercel Hobby:** use a free external scheduler such as cron-job.org: every 1 minute, `POST
  https://www.banyan-ai.app/api/worker/tick`, header `Authorization: Bearer <WORKER_SECRET>`.

**Redis: don't add it on Vercel.** If the Vercel Marketplace or an integration sets `REDIS_URL`, remove it. With no
worker to consume the queue, queued work would never run.

## 3. SocialFlow Lite on its own server

**Pick a hostname** under your domain for it, for example `social.banyan-ai.app`.

**Create a small server:** Hetzner Cloud or DigitalOcean, Ubuntu 24.04, 2 vCPU / 2 GB RAM (about $5–12 a month).
Add your SSH key at creation; in the provider's firewall allow inbound **22, 80, 443** only.

**DNS:** where `banyan-ai.app`'s DNS is managed (Vercel → Domains, or your registrar), add an `A` record `social` →
the server's IPv4 address. Wait until `nslookup social.banyan-ai.app` returns it.

**On the server:**

```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/kael-tombo/banyan.git && cd banyan/deploy/socialflow
cp env.example .env && chmod 600 .env
nano .env        # SFL_DOMAIN, ACME_EMAIL, SFL_ENCRYPTION_KEY=$(openssl rand -hex 32); LinkedIn/X keys come in steps 4–5
```

Start it after steps 4 and 5 (it needs their callback URLs registered first): `docker compose up -d --build`.
Caddy obtains the HTTPS certificate on its own.

## 4. LinkedIn developer app

LinkedIn needs a **LinkedIn Page** to own the app. A personal profile alone isn't enough.

1. If you don't have one, create a Page for Banyan (Work → Create a Company Page).
2. <https://www.linkedin.com/developers/apps> → **Create app**: name, the Page, a square logo, accept the terms.
3. **Settings** tab → **Verify** → open the link as a Page admin and approve.
4. **Products** tab → request **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**. Both are
   usually approved at once.
5. **Auth** tab → *Authorized redirect URLs* → add exactly:

   ```
   https://social.banyan-ai.app/oauth/linkedin/callback
   ```

   Optional, for "Sign in with LinkedIn" on Banyan itself, also add
   `https://www.banyan-ai.app/api/auth/oauth/linkedin/callback` and set `OAUTH_LINKEDIN_CLIENT_ID`/`_SECRET` in Vercel
   (see `docs/SSO.md`).
6. Check the scopes include `openid`, `profile`, `w_member_social`.
7. Copy **Client ID** and **Primary Client Secret** into the SocialFlow server's `.env` as `LINKEDIN_CLIENT_ID` and
   `LINKEDIN_CLIENT_SECRET`.

LinkedIn member tokens last about 60 days. SocialFlow Lite warns before expiry and refuses posts scheduled after it,
so plan to reconnect every two months.

## 5. X developer app

X's API is **paid, pay-per-use**: add a payment method.

1. <https://developer.x.com>, signed in as the account that will own the app. Accept the agreement; create a
   **Project** and an **App** in it; add billing (set a low monthly limit if offered).
2. App → **User authentication settings → Set up**:
   - App permissions: **Read and write**
   - Type of App: **Web App, Automated App or Bot**
   - Callback URI: `https://social.banyan-ai.app/oauth/x/callback`
   - Website URL: `https://www.banyan-ai.app`
   - Save, and make sure **OAuth 1.0a** is enabled.
3. **Keys and tokens → API Key and Secret** (the *consumer keys*) → copy into the SocialFlow server's `.env` as
   `X_CONSUMER_KEY` and `X_CONSUMER_SECRET`. You don't need the Bearer Token or Access Token.

If you change permissions later, regenerate the keys.

**Now start SocialFlow Lite** (step 3's command), then check it and create Banyan's key:

```bash
docker compose run --rm socialflow doctor                 # every line must be OK
docker compose run --rm socialflow keys create "Banyan"   # prints the API key once: copy it
```

## 6. Model provider and email

**Model.** The OpenCode Go key is for development only: its terms limit it to your own internal use. Production
needs a direct provider key:

| Option | Code change | Models and price (per million tokens, input / output) |
| --- | --- | --- |
| **A. OpenAI** | None | Your choice; set `OPENAI_MODEL` |
| **B. Anthropic (Claude)** | A small native provider in Banyan, about half a day for me | Claude Haiku 5.5 `claude-haiku-5-5` $0.10 / $0.50 for drafts; Claude Sonnet 5.5 `claude-sonnet-5-5` $2 / $10 for strategy and review |

In the provider's console: add billing, **set a monthly spend limit** (start around $20), and create a key named
`banyan-prod`. For A, set in Vercel: `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL`,
`MODEL_MAX_CALLS_PER_DAY=500`. For B, tell me first and I'll add the provider.

**Email** (blocker 06, for verification, password reset and the weekly digest): any SMTP provider (Resend, Postmark,
Brevo…). Verify `banyan-ai.app` as a sender domain there, then set in Vercel `SMTP_URL` (e.g.
`smtps://user:pass@smtp.provider.com:465`) and `EMAIL_FROM` (e.g. `Banyan <hello@banyan-ai.app>`).

## 7. Connect Banyan to SocialFlow and prove it

1. In Vercel set `SOCIALFLOW_API_URL=https://social.banyan-ai.app`, `SOCIALFLOW_TRANSPORT=mcp`,
   `SOCIALFLOW_VERIFIED=false`, and redeploy.
2. On `https://www.banyan-ai.app` → **Publishing**: add the SocialFlow connection with the key from step 5, then
   connect your own LinkedIn and X accounts.
3. **Smoke test with real accounts**, from your own computer in the Banyan repository:

   ```bash
   SOCIALFLOW_API_URL=https://social.banyan-ai.app SOCIALFLOW_API_KEY=<key> SOCIALFLOW_TRANSPORT=mcp npm run smoke:socialflow
   SOCIALFLOW_API_URL=https://social.banyan-ai.app SOCIALFLOW_API_KEY=<key> SOCIALFLOW_TRANSPORT=mcp npm run smoke:socialflow -- --publish
   ```

   The second command publishes one LinkedIn post and one two-post X thread and reads them back. Delete them after.
4. Only when that passes: `SOCIALFLOW_VERIFIED=true` in Vercel, and redeploy.

**Done when:** `/api/health` is green, the cron runs (visible in Vercel → Cron Jobs or the
external scheduler's log), and one Banyan post is live on LinkedIn and one on X. Tell me, and I'll run the browser
checks (blockers 04, 05) against the live site.

---

## If something goes wrong

| Symptom | Likely cause |
| --- | --- |
| Vercel deploy fails at build after merging PR #5 | Migrations: read the build log; restore from 0b's backup if needed |
| Scheduled posts never go out | Nothing calls `/api/worker/tick` (step 2), or the secret doesn't match |
| Caddy logs "no certificate" | `social` DNS doesn't point at the server yet, or 80/443 are closed |
| LinkedIn: "redirect_uri does not match" | Step 4.5's URL differs by even one character |
| X: "Callback URL not approved" / 403 on posting | Step 5.2's callback or *Read and write* permission; regenerate keys after changing it |
| Model calls fail with 401/429 | Wrong key, or the provider's spend limit was reached |

## Alternative: everything on one server

If you ever move off Vercel, `docker-compose.prod.yml`, `deploy/Caddyfile`, `scripts/deploy.sh` and
`scripts/smoke-prod.sh` run the whole stack (Banyan, worker with the agent runtime, Postgres, Redis, SocialFlow Lite)
on one VM with automatic HTTPS and rollback.
