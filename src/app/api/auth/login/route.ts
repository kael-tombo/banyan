import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { apiError, assertSameOrigin, guardRate, parseJson } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = guardRate(req, "login", 10, 60_000);
  if (limited) return limited;

  const parsed = parseJson(schema, await req.json().catch(() => ({})));
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) {
    return apiError("Invalid email or password.", 401);
  }

  const { token } = await createSession(user.id);
  // Onboarding is not a gate: everyone lands in the app, where a setup prompt
  // guides accounts that have not finished configuring their workspace.
  const res = NextResponse.json({ ok: true, next: "/app" });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
