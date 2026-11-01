# Sign-in providers (SSO)

Banyan supports signing in with **Google, Microsoft, GitHub, LinkedIn, Facebook and X**, alongside email and password.

A provider appears on the sign-in page only when both of its environment variables are set. In development (`NODE_ENV=development`), every provider is shown. Clicking one that isn't set up explains which variables it needs. In production, unconfigured providers are hidden.

## Setup

For every provider, register this **redirect URI** (also called callback URL):

```
${NEXT_PUBLIC_APP_URL}/api/auth/oauth/<provider>/callback
```

`<provider>` is one of `google`, `microsoft`, `github`, `linkedin`, `facebook`, `x`. For local development that is, for example, `http://localhost:3000/api/auth/oauth/google/callback`.

Then set the two variables in `.env`, or in the shell environment for Docker Compose, which passes them through:

| Provider | Where to create the app | Variables | Scopes Banyan requests |
|---|---|---|---|
| Google | Google Cloud console → APIs & Services → Credentials → OAuth client ID (Web application) | `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET` | `openid email profile` |
| Microsoft | Microsoft Entra admin center → App registrations → New registration (accounts in any organisational directory and personal Microsoft accounts), then Certificates & secrets | `OAUTH_MICROSOFT_CLIENT_ID`, `OAUTH_MICROSOFT_CLIENT_SECRET` | `openid email profile` |
| GitHub | GitHub → Settings → Developer settings → OAuth Apps | `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET` | `read:user user:email` |
| LinkedIn | LinkedIn Developers → create an app → add the "Sign In with LinkedIn using OpenID Connect" product | `OAUTH_LINKEDIN_CLIENT_ID`, `OAUTH_LINKEDIN_CLIENT_SECRET` | `openid profile email` |
| Facebook | Meta for Developers → create an app with the Facebook Login use case | `OAUTH_FACEBOOK_CLIENT_ID` (App ID), `OAUTH_FACEBOOK_CLIENT_SECRET` (App Secret) | `public_profile email` |
| X | X Developer Portal → your app → User authentication settings: OAuth 2.0, type "Web App" (confidential client) | `OAUTH_X_CLIENT_ID`, `OAUTH_X_CLIENT_SECRET` (the OAuth 2.0 client ID and secret, not the API key) | `users.read tweet.read` |

The scopes are the minimum needed to read who the person is. Banyan asks for nothing that could post or read private data.

## How it works

`src/lib/auth/oauth/`: `providers.ts` (endpoints and profile parsing), `flow.ts` (state, PKCE, token exchange, linking rules), `server.ts` (Next.js glue).

1. `GET /api/auth/oauth/:provider/start` creates a random `state`, plus a PKCE verifier where the provider supports one (Google, Microsoft, GitHub, X). It seals them with AES-256-GCM, together with the destination, in a 10-minute HttpOnly cookie scoped to `/api/auth/oauth`, then redirects to the provider.
2. `GET /api/auth/oauth/:provider/callback` requires the state to match the sealed cookie exactly. It exchanges the code, reads the profile once, and **discards the provider's access token**. Only the provider account ID, email, whether that email is verified, and the display name are stored (table `OAuthAccount`).
3. The linking rules (`decideOutcome`, unit-tested):
   - An identity that's already linked signs in to its user.
   - **A verified email that matches an existing account links to it.** Only Google, GitHub (verified primary email) and LinkedIn assert verification, so only they can link this way.
   - An email that isn't verified and matches an existing account is **refused**. Microsoft emails aren't verified for every tenant, and Facebook gives no verification flag. The person signs in with their password and connects the provider from Settings. This blocks taking over an account through a provider that hasn't verified the address.
   - Otherwise a new account and workspace are created, the same way password sign-up does it (`src/lib/auth/accounts.ts`).
   - X never shares an email, so a new X sign-up goes to `/signup/complete` to give one. The X identity waits in a sealed cookie, never in the request body.
4. In **Settings → Sign-in methods**, people can connect providers (`?intent=link`) and disconnect them. Disconnecting the last way to sign in is refused.

After sign-in, people are only redirected to same-site paths.

## Not included

- **Apple**: Sign in with Apple needs a client secret generated as a signed JWT from a `.p8` key and a `form_post` callback. It's a separate piece of work.
- Setting a password on an account created through a provider. Such accounts sign in with their providers, and with any others they connect.
- Enterprise SAML or per-tenant OIDC.

## Testing

- Unit tests: `tests/oauth.test.ts` covers the authorize URL, PKCE (checked against the RFC 7636 example), the sealed cookie (tampering, wrong key, expiry), profile parsing per provider, every linking rule, token-exchange auth styles and failures.
- End to end: `scripts/e2e-acceptance.sh` checks the start redirect, PKCE, the HttpOnly state cookie, forged and missing state, the cancelled flow, open-redirect refusal and the completion guard. The provider checks run when a provider is configured, for example with throwaway values:

  ```
  OAUTH_GITHUB_CLIENT_ID=e2e-client OAUTH_GITHUB_CLIENT_SECRET=e2e-secret docker compose up -d --build
  BASE_URL=http://localhost:3100 bash scripts/e2e-acceptance.sh
  ```

  A full sign-in round trip needs real credentials from the provider; it can't be simulated honestly.
