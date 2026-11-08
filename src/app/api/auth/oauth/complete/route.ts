import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, readJson } from "@/lib/api-utils";
import { createSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { createAccount } from "@/lib/auth/accounts";
import { PROVIDERS } from "@/lib/auth/oauth/providers";
import { PENDING_COOKIE, safeNext, unseal, type PendingSignup } from "@/lib/auth/oauth/flow";
import { oauthKey } from "@/lib/auth/oauth/server";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  next: z.string().max(500).optional(),
});

/**
 * POST /api/auth/oauth/complete — finish a provider sign-up that arrived
 * without an email (X never shares one). The provider identity comes from
 * the sealed pending cookie, never from the request body.
 */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "oauth-complete", 10, 60_000);
  if (limited) return limited;

  const pending = unseal<PendingSignup>(req.cookies.get(PENDING_COOKIE)?.value, oauthKey());
  if (!pending) return apiError("This sign-up expired. Start again from the sign-up page.", 410, { code: "expired" });

  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const email = parsed.data.email.toLowerCase();
  const label = PROVIDERS[pending.provider].label;

  try {
    const [owner, linked] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      prisma.oAuthAccount.findUnique({ where: { provider_providerAccountId: { provider: pending.provider, providerAccountId: pending.id } } }),
    ]);
    if (linked) return apiError(`This ${label} account is already connected. Sign in with ${label}.`, 409);
    if (owner) {
      return apiError(`An account with this email already exists. Sign in with your password, then connect ${label} in Settings.`, 409, { code: "email_in_use" });
    }

    const user = await createAccount({
      email,
      name: parsed.data.name,
      passwordHash: null,
      identity: { provider: pending.provider, id: pending.id, email: null, emailVerified: false, name: pending.name },
    });
    const { token } = await createSession(user.id);
    const res = NextResponse.json({ ok: true, next: safeNext(parsed.data.next) }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    res.cookies.set({ name: PENDING_COOKIE, value: "", path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("[oauth] complete error:", err instanceof Error ? err.message : err);
    return apiError("Banyan couldn't finish creating your account. Try again in a moment.", 503);
  }
}
