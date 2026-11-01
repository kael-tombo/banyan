import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { createAccount } from "@/lib/auth/accounts";
import { apiError, assertSameOrigin, guardRate, readJson } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "signup", 10, 60_000);
  if (limited) return limited;

  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const email = parsed.data.email.toLowerCase();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return apiError("An account with this email already exists.", 409);

    // Attribution, workspace and activity are shared with provider sign-up.
    const user = await createAccount({
      email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
    });

    const { token } = await createSession(user.id);
    // Straight into the app — setup is guided, never forced.
    const res = NextResponse.json({ ok: true, next: "/app" }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err) {
    // Database unreachable / misconfigured: return JSON (not an HTML 500) so
    // the client renders an accurate message. GET /api/health diagnoses.
    console.error("[signup] database error:", err instanceof Error ? err.message : err);
    return apiError("Service temporarily unavailable — the database could not be reached. Check GET /api/health.", 503);
  }
}
