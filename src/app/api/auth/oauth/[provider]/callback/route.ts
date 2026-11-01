import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { guardRate } from "@/lib/api-utils";
import { createSession, getSessionUser, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { createAccount, nameFor } from "@/lib/auth/accounts";
import { isProviderId, type OAuthIdentity } from "@/lib/auth/oauth/providers";
import {
  decideOutcome, exchangeCode, fetchIdentity, OAuthError, seal, statesMatch, unseal,
  PENDING_COOKIE, STATE_COOKIE, STATE_TTL_MS, type FlowState, type PendingSignup,
} from "@/lib/auth/oauth/flow";
import { credentials, oauthKey, pendingCookie, redirectTo, redirectUriFor } from "@/lib/auth/oauth/server";

/**
 * GET /api/auth/oauth/:provider/callback?code&state
 * Verifies the state, reads the identity, then signs in, links, creates an
 * account, or asks for an email — see decideOutcome for the rules.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const flow = unseal<FlowState>(req.cookies.get(STATE_COOKIE)?.value, oauthKey());
  const back = flow?.intent === "link" ? "/app/settings" : "/login";

  const fail = (error: string) => {
    const res = redirectTo(back, { error, ...(isProviderId(provider) ? { provider } : {}) });
    res.cookies.set({ name: STATE_COOKIE, value: "", path: "/api/auth/oauth", maxAge: 0 });
    return res;
  };

  const limited = await guardRate(req, "oauth-callback", 30, 60_000);
  if (limited) return limited;
  if (!isProviderId(provider)) return fail("not_configured");

  const q = req.nextUrl.searchParams;
  // The person declined, or the provider refused before asking.
  if (q.get("error")) return fail(q.get("error") === "access_denied" ? "cancelled" : "token_exchange_failed");
  if (!flow || flow.provider !== provider || !statesMatch(flow.state, q.get("state"))) return fail("expired");
  const code = q.get("code");
  if (!code) return fail("expired");
  const creds = credentials(provider);
  if (!creds) return fail("not_configured");

  let identity: OAuthIdentity;
  try {
    const token = await exchangeCode(provider, code, flow.verifier, creds, redirectUriFor(provider));
    identity = await fetchIdentity(provider, token);
  } catch (err) {
    return fail(err instanceof OAuthError ? err.code : "unavailable");
  }

  try {
    const [linked, sessionUser, emailOwner] = await Promise.all([
      prisma.oAuthAccount.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId: identity.id } } }),
      flow.intent === "link" ? getSessionUser(req.cookies.get(SESSION_COOKIE)?.value) : Promise.resolve(null),
      identity.email ? prisma.user.findUnique({ where: { email: identity.email }, select: { id: true } }) : Promise.resolve(null),
    ]);
    const outcome = decideOutcome({
      intent: flow.intent,
      identity,
      linkedUserId: linked?.userId ?? null,
      sessionUserId: sessionUser?.id ?? null,
      emailOwnerId: emailOwner?.id ?? null,
    });

    const identityData = { email: identity.email, emailVerified: identity.emailVerified, displayName: identity.name, lastUsedAt: new Date() };
    let userId: string;
    switch (outcome.kind) {
      case "error":
        return fail(outcome.code);
      case "needs_email": {
        const pending: PendingSignup = { provider, id: identity.id, name: identity.name, exp: Date.now() + STATE_TTL_MS };
        const res = redirectTo("/signup/complete", { next: flow.next });
        res.cookies.set({ name: STATE_COOKIE, value: "", path: "/api/auth/oauth", maxAge: 0 });
        res.cookies.set(pendingCookie(seal(pending, oauthKey())));
        return res;
      }
      case "signin":
        userId = outcome.userId;
        await prisma.oAuthAccount.update({ where: { id: linked!.id }, data: identityData });
        break;
      case "link":
        userId = outcome.userId;
        await prisma.oAuthAccount.upsert({
          where: { provider_providerAccountId: { provider, providerAccountId: identity.id } },
          create: { userId, provider, providerAccountId: identity.id, ...identityData },
          update: identityData,
        });
        if (outcome.then === "settings") {
          const res = redirectTo(flow.next, { linked: provider });
          res.cookies.set({ name: STATE_COOKIE, value: "", path: "/api/auth/oauth", maxAge: 0 });
          return res;
        }
        break;
      case "create": {
        const user = await createAccount({ email: identity.email!, name: nameFor(identity, identity.email!), passwordHash: null, identity });
        userId = user.id;
        break;
      }
    }

    const { token } = await createSession(userId);
    const res = redirectTo(flow.next);
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    res.cookies.set({ name: STATE_COOKIE, value: "", path: "/api/auth/oauth", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("[oauth] callback error:", err instanceof Error ? err.message : err);
    return fail("unavailable");
  }
}
