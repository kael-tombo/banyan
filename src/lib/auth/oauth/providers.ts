/**
 * Sign-in providers (SSO).
 *
 * Every endpoint below is the provider's documented OAuth 2.0 / OpenID
 * Connect endpoint. A provider is offered only when its client id and secret
 * are configured; nothing here pretends a provider works without them.
 *
 * Email trust: `trustsEmail` says whether the provider's "verified" flag may
 * be used to link a sign-in to an existing Banyan account with the same
 * email. Only providers that assert verification per address qualify.
 * Microsoft's email claim is not verified for every tenant, Facebook does
 * not expose a verification flag, and X does not return an email at all, so
 * those never link automatically.
 */

export const PROVIDER_IDS = ["google", "microsoft", "github", "linkedin", "facebook", "x"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);
}

/** What Banyan keeps from a provider: an identity, never its tokens. */
export type OAuthIdentity = {
  provider: ProviderId;
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
};

export type ProviderDef = {
  id: ProviderId;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** PKCE (S256). Required by X; supported by Google, Microsoft and GitHub. */
  pkce: boolean;
  /** How the client authenticates at the token endpoint. */
  tokenAuth: "body" | "basic";
  trustsEmail: boolean;
  /** Extra authorize parameters. */
  extraAuthorize?: Record<string, string>;
  envKey: string;
};

const FB = "v21.0";

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  google: {
    id: "google",
    label: "Google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "profile"],
    pkce: true,
    tokenAuth: "body",
    trustsEmail: true,
    extraAuthorize: { prompt: "select_account" },
    envKey: "GOOGLE",
  },
  microsoft: {
    id: "microsoft",
    label: "Microsoft",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["openid", "email", "profile"],
    pkce: true,
    tokenAuth: "body",
    trustsEmail: false,
    extraAuthorize: { prompt: "select_account" },
    envKey: "MICROSOFT",
  },
  github: {
    id: "github",
    label: "GitHub",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["read:user", "user:email"],
    pkce: true,
    tokenAuth: "body",
    trustsEmail: true,
    envKey: "GITHUB",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "email"],
    pkce: false,
    tokenAuth: "body",
    trustsEmail: true,
    envKey: "LINKEDIN",
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    authorizeUrl: `https://www.facebook.com/${FB}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${FB}/oauth/access_token`,
    scopes: ["public_profile", "email"],
    pkce: false,
    tokenAuth: "body",
    trustsEmail: false,
    envKey: "FACEBOOK",
  },
  x: {
    id: "x",
    label: "X",
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["users.read", "tweet.read"],
    pkce: true,
    tokenAuth: "basic",
    trustsEmail: false,
    envKey: "X",
  },
};

export type ProviderCredentials = { clientId: string; clientSecret: string };

/** Credentials for a provider, or null when it is not configured. */
export function credentialsFor(id: ProviderId, source: Record<string, string | undefined>): ProviderCredentials | null {
  const key = PROVIDERS[id].envKey;
  const clientId = (source[`OAUTH_${key}_CLIENT_ID`] || "").trim();
  const clientSecret = (source[`OAUTH_${key}_CLIENT_SECRET`] || "").trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export type ProviderOption = { id: ProviderId; label: string; configured: boolean };

/** Providers in display order, with whether each is configured. */
export function providerOptions(source: Record<string, string | undefined>): ProviderOption[] {
  return PROVIDER_IDS.map((id) => ({ id, label: PROVIDERS[id].label, configured: credentialsFor(id, source) !== null }));
}

export function callbackUrl(appUrl: string, id: ProviderId): string {
  return `${appUrl.replace(/\/+$/, "")}/api/auth/oauth/${id}/callback`;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const lower = (v: unknown): string | null => str(v)?.toLowerCase() ?? null;

/**
 * Turn a provider's profile response into an identity. `extra` carries the
 * GitHub email list. Returns null when the response has no stable id.
 */
export function normalizeProfile(id: ProviderId, raw: unknown, extra?: unknown): OAuthIdentity | null {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (id) {
    case "google":
    case "linkedin":
    case "microsoft": {
      const sub = str(p.sub);
      if (!sub) return null;
      // Microsoft's preferred_username is a sign-in name, not always a mailbox,
      // so it is never used as an email.
      const email = lower(p.email);
      const verified = PROVIDERS[id].trustsEmail && (p.email_verified === true || p.email_verified === "true");
      return { provider: id, id: sub, email: email && email.includes("@") ? email : null, emailVerified: Boolean(email) && verified, name: str(p.name) };
    }
    case "github": {
      const ghId = typeof p.id === "number" || typeof p.id === "string" ? String(p.id) : null;
      if (!ghId) return null;
      const list = Array.isArray(extra) ? (extra as Record<string, unknown>[]) : [];
      const primary = list.find((e) => e.primary === true && e.verified === true) ?? list.find((e) => e.verified === true);
      const email = lower(primary?.email) ?? lower(p.email);
      return { provider: id, id: ghId, email, emailVerified: Boolean(primary && lower(primary.email) === email), name: str(p.name) ?? str(p.login) };
    }
    case "facebook": {
      const fbId = str(p.id);
      if (!fbId) return null;
      return { provider: id, id: fbId, email: lower(p.email), emailVerified: false, name: str(p.name) };
    }
    case "x": {
      const d = (p.data && typeof p.data === "object" ? p.data : {}) as Record<string, unknown>;
      const xId = str(d.id);
      if (!xId) return null;
      return { provider: id, id: xId, email: null, emailVerified: false, name: str(d.name) ?? str(d.username) };
    }
  }
}
