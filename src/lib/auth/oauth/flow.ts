import crypto from "node:crypto";
import { PROVIDERS, normalizeProfile, type OAuthIdentity, type ProviderCredentials, type ProviderId } from "./providers";

/**
 * The OAuth authorization-code flow, as pure functions where possible so it
 * can be tested without a browser or a provider.
 *
 * - State, PKCE verifier, intent and destination travel in an encrypted,
 *   authenticated (AES-256-GCM) cookie that lives ten minutes and is scoped
 *   to the OAuth routes. The state in the callback must match it exactly.
 * - Provider tokens are used once to read the profile and then dropped.
 */

export const STATE_COOKIE = "banyan_oauth";
export const PENDING_COOKIE = "banyan_oauth_pending";
export const STATE_TTL_MS = 10 * 60 * 1000;

export type Intent = "signin" | "link";

export type FlowState = {
  provider: ProviderId;
  state: string;
  verifier: string | null;
  intent: Intent;
  next: string;
  exp: number;
};

/** A provider identity that still needs an email before an account exists. */
export type PendingSignup = { provider: ProviderId; id: string; name: string | null; exp: number };

const b64url = (buf: Buffer) => buf.toString("base64url");

export function randomToken(bytes = 32): string {
  return b64url(crypto.randomBytes(bytes));
}

export function pkceChallenge(verifier: string): string {
  return b64url(crypto.createHash("sha256").update(verifier).digest());
}

/** Seal a JSON value with a 32-byte key (hex). */
export function seal(value: unknown, keyHex: string): string {
  const key = crypto.createHash("sha256").update(`oauth:${keyHex}`).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return b64url(Buffer.concat([iv, cipher.getAuthTag(), enc]));
}

/** Open a sealed value; null when tampered with, malformed or expired. */
export function unseal<T extends { exp: number }>(sealed: string | undefined, keyHex: string, now = Date.now()): T | null {
  if (!sealed) return null;
  try {
    const key = crypto.createHash("sha256").update(`oauth:${keyHex}`).digest();
    const buf = Buffer.from(sealed, "base64url");
    if (buf.length < 29) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8")) as T;
    return typeof value?.exp === "number" && value.exp > now ? value : null;
  } catch {
    return null;
  }
}

export function statesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Only same-site paths may be a destination after sign-in. */
export function safeNext(raw: string | null | undefined, fallback = "/app"): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : fallback;
}

export function newFlowState(provider: ProviderId, intent: Intent, next: string, now = Date.now()): FlowState {
  return {
    provider,
    state: randomToken(),
    verifier: PROVIDERS[provider].pkce ? randomToken(48) : null,
    intent,
    next: safeNext(next),
    exp: now + STATE_TTL_MS,
  };
}

export function authorizeUrl(flow: FlowState, creds: ProviderCredentials, redirectUri: string): string {
  const def = PROVIDERS[flow.provider];
  const url = new URL(def.authorizeUrl);
  const params: Record<string, string> = {
    response_type: "code",
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    scope: def.scopes.join(" "),
    state: flow.state,
    ...(def.extraAuthorize ?? {}),
  };
  if (flow.verifier) {
    params.code_challenge = pkceChallenge(flow.verifier);
    params.code_challenge_method = "S256";
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class OAuthError extends Error {
  constructor(public code: "token_exchange_failed" | "profile_failed" | "no_identity", message: string) {
    super(message);
  }
}

async function withTimeout(fetcher: FetchLike, url: string, init: RequestInit, ms = 10_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetcher(url, { ...init, signal: ctrl.signal, redirect: "error" });
  } finally {
    clearTimeout(t);
  }
}

/** Exchange the authorization code for an access token. */
export async function exchangeCode(
  provider: ProviderId,
  code: string,
  verifier: string | null,
  creds: ProviderCredentials,
  redirectUri: string,
  fetcher: FetchLike = fetch,
): Promise<string> {
  const def = PROVIDERS[provider];
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (def.tokenAuth === "basic") {
    headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(creds.clientId)}:${encodeURIComponent(creds.clientSecret)}`).toString("base64")}`;
    body.set("client_id", creds.clientId);
  } else {
    body.set("client_id", creds.clientId);
    body.set("client_secret", creds.clientSecret);
  }
  if (verifier) body.set("code_verifier", verifier);

  let res: Response;
  try {
    res = await withTimeout(fetcher, def.tokenUrl, { method: "POST", headers, body: body.toString() });
  } catch {
    throw new OAuthError("token_exchange_failed", `${def.label} could not be reached.`);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const token = typeof data.access_token === "string" ? data.access_token : null;
  if (!res.ok || !token) throw new OAuthError("token_exchange_failed", `${def.label} did not accept the sign-in.`);
  return token;
}

const PROFILE_URL: Record<ProviderId, string> = {
  google: "https://openidconnect.googleapis.com/v1/userinfo",
  microsoft: "https://graph.microsoft.com/oidc/userinfo",
  github: "https://api.github.com/user",
  linkedin: "https://api.linkedin.com/v2/userinfo",
  facebook: "https://graph.facebook.com/v21.0/me?fields=id,name,email",
  x: "https://api.twitter.com/2/users/me",
};

/** Read the signed-in person's identity with the access token. */
export async function fetchIdentity(provider: ProviderId, accessToken: string, fetcher: FetchLike = fetch): Promise<OAuthIdentity> {
  const label = PROVIDERS[provider].label;
  const headers = { authorization: `Bearer ${accessToken}`, accept: "application/json", "user-agent": "Banyan.ai" };
  const get = async (url: string) => {
    let res: Response;
    try {
      res = await withTimeout(fetcher, url, { headers });
    } catch {
      throw new OAuthError("profile_failed", `${label} could not be reached.`);
    }
    if (!res.ok) throw new OAuthError("profile_failed", `${label} did not share your profile.`);
    return res.json().catch(() => null);
  };
  const profile = await get(PROFILE_URL[provider]);
  const extra = provider === "github" ? await get("https://api.github.com/user/emails").catch(() => []) : undefined;
  const identity = normalizeProfile(provider, profile, extra);
  if (!identity) throw new OAuthError("no_identity", `${label} did not return an account id.`);
  return identity;
}

/** What the callback should do with a verified identity. */
export type Outcome =
  | { kind: "signin"; userId: string }
  | { kind: "link"; userId: string; then: "signin" | "settings" }
  | { kind: "create" }
  | { kind: "needs_email" }
  | { kind: "error"; code: "linked_elsewhere" | "email_in_use" | "signin_required" };

/**
 * The account-linking rules, in one place:
 * 1. An identity already linked signs in to its user.
 * 2. "Connect" from settings links the identity to the signed-in user,
 *    unless it already belongs to someone else.
 * 3. A provider-verified email that matches an account links to it.
 * 4. An unverified email that matches an account is refused: the founder
 *    signs in with their password and connects the provider from settings.
 * 5. Otherwise a new account is created, after asking for an email when the
 *    provider did not give one.
 */
export function decideOutcome(input: {
  intent: Intent;
  identity: Pick<OAuthIdentity, "email" | "emailVerified">;
  linkedUserId: string | null;
  sessionUserId: string | null;
  emailOwnerId: string | null;
}): Outcome {
  const { intent, identity, linkedUserId, sessionUserId, emailOwnerId } = input;
  if (intent === "link") {
    if (!sessionUserId) return { kind: "error", code: "signin_required" };
    if (linkedUserId && linkedUserId !== sessionUserId) return { kind: "error", code: "linked_elsewhere" };
    return { kind: "link", userId: sessionUserId, then: "settings" };
  }
  if (linkedUserId) return { kind: "signin", userId: linkedUserId };
  if (emailOwnerId) {
    return identity.emailVerified ? { kind: "link", userId: emailOwnerId, then: "signin" } : { kind: "error", code: "email_in_use" };
  }
  return identity.email ? { kind: "create" } : { kind: "needs_email" };
}
