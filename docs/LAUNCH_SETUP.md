# Launch setup: the founder's steps

What only you can do to unblock a real cycle (blockers 01, 02, 03 in `mvp-blockers/`), in the order that works:
the domain comes first because both developer consoles need its callback URLs.

Plan about half a day, plus waiting time for DNS and for LinkedIn's product approval.

| Step | What you end with | Unblocks |
| --- | --- | --- |
| 1. Domain and server | Two hostnames pointing at one server | 02, and the callback URLs for 2 and 3 |
| 2. LinkedIn developer app | `LINKEDIN_CLIENT_ID` and `_SECRET` | 01 |
| 3. X developer app | `X_CONSUMER_KEY` and `_SECRET` | 01 |
| 4. Model provider | A production API key with a spend cap | 03 |
| 5. Deploy and prove it | Banyan live on HTTPS, one real post on each network | 01, 02, 12 |

Keep every secret in a password manager and in the server's `.env` only. Never paste one into a chat, an issue or a
commit.

---

## 1. Domain and server

**Choose two hostnames** on a domain you own, for example:

- `app.<your-domain>`: Banyan (`APP_DOMAIN`)
- `social.<your-domain>`: SocialFlow Lite's sign-in callbacks (`SFL_DOMAIN`)

**Create the server.** One Linux VM runs everything (Banyan web, worker, Postgres, Redis, SocialFlow Lite, Caddy for
HTTPS). Recommended: Hetzner Cloud or DigitalOcean, **Ubuntu 24.04, 2 vCPU, 4 GB RAM, 80 GB disk** (about $8–25 a
month). Building the image needs the 4 GB; 2 GB machines run out of memory during the build.

1. Create the VM and add your SSH public key during creation (no password login).
2. In the provider's firewall, allow inbound **22, 80, 443** only.
3. Note the server's public IPv4 address.

**Point DNS at it.** At your domain registrar, add two `A` records to that IPv4 address: `app` and `social`. Check
with `nslookup app.<your-domain>` until both return the server's address (minutes to a few hours).

**Prepare the server** (SSH in as root once):

```bash
adduser deploy && usermod -aG sudo deploy          # a non-root user for everything below
curl -fsSL https://get.docker.com | sh && usermod -aG docker deploy
su - deploy
git clone https://github.com/kael-tombo/banyan.git && cd banyan
git checkout main                                   # after PR #5 is merged; until then: mvp/socialflow-foundation
cp .env.example .env && chmod 600 .env
```

Fill these in `.env` now (the rest come in steps 2–4):

```bash
APP_DOMAIN="app.<your-domain>"
SFL_DOMAIN="social.<your-domain>"
ACME_EMAIL="<your email>"                          # certificate expiry notices
POSTGRES_PASSWORD="<openssl rand -hex 24>"
APP_SECRET="<openssl rand -hex 32>"
WORKER_SECRET="<openssl rand -hex 24>"
SFL_ENCRYPTION_KEY="<openssl rand -hex 32>"        # losing it means reconnecting every account
SOCIALFLOW_API_URL="http://socialflow:8080"
SOCIALFLOW_ALLOW_PRIVATE_NETWORK="true"
SOCIALFLOW_TRANSPORT="mcp"
SOCIALFLOW_VERIFIED="false"                        # set to true only after step 5's smoke test
```

Run `openssl rand -hex 32` on the server for each value; never reuse one.

---

## 2. LinkedIn developer app

LinkedIn needs a **LinkedIn Page** to own the app. A personal profile alone isn't enough.

1. If you don't have one, create a Page for your company at linkedin.com (Work → Create a Company Page).
2. Go to <https://www.linkedin.com/developers/apps> → **Create app**. Name: your product; LinkedIn Page: the one
   above; logo: any square image; accept the terms.
3. **Verify the app with the Page:** on the app's *Settings* tab, click **Verify**, open the link as a Page admin,
   and approve.
4. **Products** tab → request both:
   - **Sign In with LinkedIn using OpenID Connect**
   - **Share on LinkedIn**

   Both are usually approved at once. If either shows "Review in progress", wait for it.
5. **Auth** tab → *Authorized redirect URLs for your app* → add exactly:

   ```
   https://social.<your-domain>/oauth/linkedin/callback
   ```

6. Still on **Auth**, check that the OAuth 2.0 scopes list `openid`, `profile` and `w_member_social`.
7. Copy **Client ID** and **Primary Client Secret** into `.env`:

   ```bash
   LINKEDIN_CLIENT_ID="..."
   LINKEDIN_CLIENT_SECRET="..."
   ```

Optional: to let founders *sign in to Banyan* with LinkedIn too, also add
`https://app.<your-domain>/api/auth/oauth/linkedin/callback` and set `OAUTH_LINKEDIN_CLIENT_ID`/`_SECRET` to the same
values (see `docs/SSO.md`). Publishing doesn't need this.

LinkedIn member tokens last about 60 days. SocialFlow Lite shows when one expires and refuses posts scheduled after
that date, so plan to reconnect every two months.

---

## 3. X developer app

X's API is **paid, pay-per-use**: you'll need to add a payment method.

1. Go to <https://developer.x.com> and sign in with the X account that will own the app (it doesn't have to be the
   account you post from).
2. Open the developer portal, accept the developer agreement, and create a **Project** and an **App** inside it.
3. Add billing as the portal asks (pay-per-use). Set a low monthly limit if the portal offers one.
4. In the App → **User authentication settings** → **Set up**:
   - **App permissions:** *Read and write*
   - **Type of App:** *Web App, Automated App or Bot*
   - **Callback URI / Redirect URL:**

     ```
     https://social.<your-domain>/oauth/x/callback
     ```

   - **Website URL:** `https://app.<your-domain>`
   - Save. Make sure **OAuth 1.0a** is enabled; SocialFlow Lite uses it.
5. **Keys and tokens** tab → **API Key and Secret** (also called *Consumer Keys*) → **Regenerate** if needed, and copy
   both into `.env`:

   ```bash
   X_CONSUMER_KEY="..."
   X_CONSUMER_SECRET="..."
   ```

   You don't need the Bearer Token or the Access Token. Each person connects their own account from Banyan.

If you change permissions later, regenerate the keys: X ties the permission level to the keys issued under it.

---

## 4. Model provider

Your OpenCode Go key is for development only: its terms limit it to your own internal use, so it can't write for
customers. Production needs a direct provider key. Two choices:

| Option | Code change | Models and price (per million tokens, input / output) |
| --- | --- | --- |
| **A. OpenAI** | None: Banyan's router speaks the OpenAI API today | Your choice of model; set `OPENAI_MODEL` |
| **B. Anthropic (Claude)** | A small native provider in Banyan (blocker 03 step 2), about half a day of work for me | Claude Haiku 5.5 `claude-haiku-5-5` $0.10 / $0.50 for drafts and extraction; Claude Sonnet 5.5 `claude-sonnet-5-5` $2 / $10 for strategy and review |

The eval already measured a cycle at under $0.001 of model cost on a small model, so either fits the credit price.
If you pick B, tell me and I'll add the provider before you deploy. Claude is called through Anthropic's own SDK,
not through an OpenAI-compatible shim.

**Whichever you pick:**

1. Create an account in the provider's console (OpenAI: platform.openai.com; Anthropic: platform.claude.com).
2. Add a payment method and **set a monthly spend limit** in the console's billing or limits settings. Start low,
   for example $20, and raise it as real use shows what you need.
3. Create an API key **for this server only**, named for example `banyan-prod`, and store it in your password manager.
4. Put it in `.env`:

   ```bash
   # Option A
   AI_PROVIDER="openai"
   OPENAI_API_KEY="..."
   OPENAI_MODEL="<model id>"
   MODEL_MAX_CALLS_PER_DAY="500"      # per workspace; Banyan's own cap, under the provider's
   ```

   (Option B's variable names come with the provider change.)

---

## 5. Deploy and prove it

On the server, in `~/banyan`:

```bash
scripts/deploy.sh
```

It builds, applies the database migrations, starts everything behind Caddy (which gets the HTTPS certificates
itself), and checks `https://app.<your-domain>/api/health`. If the check fails, it puts the previous version back.

Then:

1. **Check SocialFlow Lite's configuration** (proves the LinkedIn and X keys, and that X has the callback registered):

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile socialflow run --rm socialflow doctor
   ```

   Fix any `FAIL` line it prints, then run `scripts/deploy.sh` again.
2. **Create Banyan's key for SocialFlow Lite:**

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile socialflow run --rm socialflow keys create "Banyan"
   ```

   It prints the key once. Copy it.
3. Open `https://app.<your-domain>`, sign up, and on **Publishing** add the SocialFlow connection with that key.
4. **Connect** your own LinkedIn and X accounts from the Publishing page.
5. **Smoke test on real accounts.** First without publishing (checks the key and the connected accounts), then with
   one real LinkedIn post and one two-post X thread, which it reads back. Delete the test posts afterwards.

   ```bash
   scripts/smoke-prod.sh <the key from step 2>
   scripts/smoke-prod.sh <the key from step 2> --publish
   ```

6. Only when that passes: set `SOCIALFLOW_VERIFIED="true"` in `.env` and run `scripts/deploy.sh` again.

**Done when:** health is green from your phone on mobile data, you signed up on the public address, and one Banyan
post is live on LinkedIn and one on X. Tell me, and I'll run the browser checks (blockers 04, 05) against the live
site and set up nightly backups before any outside founder joins.

---

## If something goes wrong

| Symptom | Likely cause |
| --- | --- |
| Caddy logs "no certificate" | DNS doesn't point at the server yet, or ports 80/443 are closed |
| LinkedIn: "redirect_uri does not match" | The redirect URL in step 2.5 differs by even one character (https, trailing slash) |
| X: "Callback URL not approved" | Step 3.4's callback differs from `https://social.<your-domain>/oauth/x/callback` |
| X: 403 when posting | App permissions aren't *Read and write*, or the keys predate that change (regenerate) |
| Model calls fail with 401/429 | Wrong key, or the provider's spend limit was reached |
| `deploy.sh` rolled back | Read the last 60 web log lines it printed; usually a missing `.env` value |
