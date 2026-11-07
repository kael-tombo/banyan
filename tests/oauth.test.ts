import { describe, it, expect } from "vitest";
import { callbackUrl, credentialsFor, normalizeProfile, providerOptions, PROVIDER_IDS } from "@/lib/auth/oauth/providers";
import {
  authorizeUrl, decideOutcome, exchangeCode, fetchIdentity, newFlowState, OAuthError, pkceChallenge, safeNext, seal, statesMatch, unseal,
  type FetchLike, type FlowState,
} from "@/lib/auth/oauth/flow";

const KEY = "a".repeat(64);
const creds = { clientId: "client-123", clientSecret: "shh" };
const REDIRECT = "https://app.example.com/api/auth/oauth/google/callback";

describe("provider configuration", () => {
  it("offers a provider only when both its id and secret are set", () => {
    expect(credentialsFor("google", { OAUTH_GOOGLE_CLIENT_ID: "id" })).toBeNull();
    expect(credentialsFor("google", { OAUTH_GOOGLE_CLIENT_ID: " id ", OAUTH_GOOGLE_CLIENT_SECRET: "s" })).toEqual({ clientId: "id", clientSecret: "s" });
    const opts = providerOptions({ OAUTH_X_CLIENT_ID: "x", OAUTH_X_CLIENT_SECRET: "y" });
    expect(opts.map((o) => o.id)).toEqual([...PROVIDER_IDS]);
    expect(opts.filter((o) => o.configured).map((o) => o.id)).toEqual(["x"]);
  });

  it("builds the callback URL from the app URL", () => {
    expect(callbackUrl("https://app.example.com/", "github")).toBe("https://app.example.com/api/auth/oauth/github/callback");
  });
});

describe("authorize URL", () => {
  it("sends state, scopes and an S256 PKCE challenge for Google", () => {
    const flow = newFlowState("google", "signin", "/app/goals");
    const url = new URL(authorizeUrl(flow, creds, REDIRECT));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("state")).toBe(flow.state);
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("code_challenge")).toBe(pkceChallenge(flow.verifier!));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("uses PKCE for X and none for LinkedIn and Facebook", () => {
    expect(newFlowState("x", "signin", "/app").verifier).toBeTruthy();
    for (const p of ["linkedin", "facebook"] as const) {
      const flow = newFlowState(p, "signin", "/app");
      expect(flow.verifier).toBeNull();
      expect(new URL(authorizeUrl(flow, creds, REDIRECT)).searchParams.has("code_challenge")).toBe(false);
    }
  });

  it("matches the RFC 7636 PKCE example", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("never carries an off-site destination", () => {
    expect(newFlowState("google", "signin", "https://evil.example").next).toBe("/app");
    expect(newFlowState("google", "signin", "//evil.example").next).toBe("/app");
    expect(safeNext("/\\evil.example")).toBe("/app");
    expect(safeNext("/app/cycles/new")).toBe("/app/cycles/new");
  });
});

describe("sealed state cookie", () => {
  const flow: FlowState = { provider: "github", state: "s1", verifier: "v1", intent: "signin", next: "/app", exp: Date.now() + 60_000 };

  it("round-trips", () => {
    expect(unseal<FlowState>(seal(flow, KEY), KEY)).toEqual(flow);
  });

  it("rejects tampering, the wrong key, expiry and junk", () => {
    const sealed = seal(flow, KEY);
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(unseal(tampered, KEY)).toBeNull();
    expect(unseal(sealed, "b".repeat(64))).toBeNull();
    expect(unseal(sealed, KEY, flow.exp + 1)).toBeNull();
    expect(unseal("not-a-cookie", KEY)).toBeNull();
    expect(unseal(undefined, KEY)).toBeNull();
  });

  it("compares states exactly", () => {
    expect(statesMatch("abc", "abc")).toBe(true);
    expect(statesMatch("abc", "abd")).toBe(false);
    expect(statesMatch("abc", "abcd")).toBe(false);
    expect(statesMatch("abc", null)).toBe(false);
  });
});

describe("profile normalisation", () => {
  it("Google: trusts its verified flag", () => {
    expect(normalizeProfile("google", { sub: "g1", email: "Ada@Ledgerline.app", email_verified: true, name: "Ada" })).toEqual({
      provider: "google", id: "g1", email: "ada@ledgerline.app", emailVerified: true, name: "Ada",
    });
    expect(normalizeProfile("google", { sub: "g1", email: "ada@x.com", email_verified: false })?.emailVerified).toBe(false);
  });

  it("Microsoft: never treats its email as verified, never uses preferred_username", () => {
    const id = normalizeProfile("microsoft", { sub: "m1", email: "ada@x.com", email_verified: true, preferred_username: "ada@corp" });
    expect(id?.emailVerified).toBe(false);
    expect(normalizeProfile("microsoft", { sub: "m1", preferred_username: "ada@corp" })?.email).toBeNull();
  });

  it("GitHub: uses the verified primary email from the email list", () => {
    const id = normalizeProfile("github", { id: 42, login: "ada", name: null, email: null }, [
      { email: "old@x.com", primary: false, verified: true },
      { email: "Ada@Ledgerline.app", primary: true, verified: true },
    ]);
    expect(id).toEqual({ provider: "github", id: "42", email: "ada@ledgerline.app", emailVerified: true, name: "ada" });
    const unverified = normalizeProfile("github", { id: 42, email: "pub@x.com" }, [{ email: "pub@x.com", primary: true, verified: false }]);
    expect(unverified?.emailVerified).toBe(false);
  });

  it("Facebook: email is never treated as verified", () => {
    expect(normalizeProfile("facebook", { id: "f1", email: "ada@x.com", name: "Ada" })?.emailVerified).toBe(false);
  });

  it("X: no email, name falls back to the handle", () => {
    expect(normalizeProfile("x", { data: { id: "x1", username: "ada" } })).toEqual({ provider: "x", id: "x1", email: null, emailVerified: false, name: "ada" });
  });

  it("returns null without a stable id", () => {
    expect(normalizeProfile("google", { email: "a@b.c" })).toBeNull();
    expect(normalizeProfile("x", {})).toBeNull();
    expect(normalizeProfile("github", null)).toBeNull();
  });
});

describe("account linking rules", () => {
  const verified = { email: "ada@x.com", emailVerified: true };
  const unverified = { email: "ada@x.com", emailVerified: false };
  const base = { linkedUserId: null, sessionUserId: null, emailOwnerId: null };

  it("signs in an identity that is already linked", () => {
    expect(decideOutcome({ ...base, intent: "signin", identity: unverified, linkedUserId: "u1", emailOwnerId: "u2" })).toEqual({ kind: "signin", userId: "u1" });
  });

  it("links a verified email to the existing account", () => {
    expect(decideOutcome({ ...base, intent: "signin", identity: verified, emailOwnerId: "u2" })).toEqual({ kind: "link", userId: "u2", then: "signin" });
  });

  it("refuses an unverified email that belongs to someone", () => {
    expect(decideOutcome({ ...base, intent: "signin", identity: unverified, emailOwnerId: "u2" })).toEqual({ kind: "error", code: "email_in_use" });
  });

  it("creates an account, or asks for an email first", () => {
    expect(decideOutcome({ ...base, intent: "signin", identity: unverified })).toEqual({ kind: "create" });
    expect(decideOutcome({ ...base, intent: "signin", identity: { email: null, emailVerified: false } })).toEqual({ kind: "needs_email" });
  });

  it("connect from settings: needs a session, refuses someone else's identity", () => {
    expect(decideOutcome({ ...base, intent: "link", identity: verified })).toEqual({ kind: "error", code: "signin_required" });
    expect(decideOutcome({ ...base, intent: "link", identity: verified, sessionUserId: "u1", linkedUserId: "u9" })).toEqual({ kind: "error", code: "linked_elsewhere" });
    expect(decideOutcome({ ...base, intent: "link", identity: unverified, sessionUserId: "u1", emailOwnerId: "u9" })).toEqual({ kind: "link", userId: "u1", then: "settings" });
  });
});

describe("token exchange and profile fetch", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("sends client credentials in the body, with the PKCE verifier", async () => {
    let seen: { url: string; body: string; headers: Record<string, string> } | null = null;
    const f: FetchLike = async (url, init) => {
      seen = { url, body: String(init?.body), headers: init?.headers as Record<string, string> };
      return json({ access_token: "tok" });
    };
    await expect(exchangeCode("google", "code1", "ver1", creds, REDIRECT, f)).resolves.toBe("tok");
    const body = new URLSearchParams(seen!.body);
    expect(seen!.url).toBe("https://oauth2.googleapis.com/token");
    expect(body.get("client_secret")).toBe("shh");
    expect(body.get("code_verifier")).toBe("ver1");
    expect(body.get("redirect_uri")).toBe(REDIRECT);
  });

  it("uses HTTP Basic for X and keeps the secret out of the body", async () => {
    let seen: { body: string; headers: Record<string, string> } | null = null;
    const f: FetchLike = async (_u, init) => {
      seen = { body: String(init?.body), headers: init?.headers as Record<string, string> };
      return json({ access_token: "tok" });
    };
    await exchangeCode("x", "c", "v", creds, REDIRECT, f);
    expect(seen!.headers.authorization).toBe(`Basic ${Buffer.from("client-123:shh").toString("base64")}`);
    expect(new URLSearchParams(seen!.body).has("client_secret")).toBe(false);
  });

  it("fails clearly when the provider refuses or is unreachable", async () => {
    await expect(exchangeCode("github", "c", null, creds, REDIRECT, async () => json({ error: "bad_verification_code" }))).rejects.toMatchObject({ code: "token_exchange_failed" });
    await expect(exchangeCode("github", "c", null, creds, REDIRECT, async () => { throw new Error("ECONNRESET"); })).rejects.toBeInstanceOf(OAuthError);
  });

  it("reads GitHub's profile and email list", async () => {
    const urls: string[] = [];
    const f: FetchLike = async (url) => {
      urls.push(url);
      return url.endsWith("/emails") ? json([{ email: "ada@x.com", primary: true, verified: true }]) : json({ id: 7, login: "ada" });
    };
    const id = await fetchIdentity("github", "tok", f);
    expect(urls).toEqual(["https://api.github.com/user", "https://api.github.com/user/emails"]);
    expect(id).toMatchObject({ id: "7", email: "ada@x.com", emailVerified: true });
  });

  it("reports a profile without an id", async () => {
    await expect(fetchIdentity("google", "tok", async () => json({ email: "a@b.c" }))).rejects.toMatchObject({ code: "no_identity" });
    await expect(fetchIdentity("google", "tok", async () => json({}, 401))).rejects.toMatchObject({ code: "profile_failed" });
  });
});
