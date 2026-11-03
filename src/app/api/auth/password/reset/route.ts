import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin, guardRate, readJson } from "@/lib/api-utils";
import { resetPassword } from "@/lib/auth/email-flows";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

const schema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
});

const REASON: Record<"invalid" | "expired" | "used", string> = {
  invalid: "This reset link is not valid. Ask for a new one.",
  expired: "This reset link has expired (links last 1 hour). Ask for a new one.",
  used: "This reset link has already been used. Ask for a new one if you still need it.",
};

/** US-012: set a new password from a reset link; every session, including this browser's, is signed out. */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "password-reset", 10, 15 * 60_000);
  if (limited) return limited;
  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const res = await resetPassword(parsed.data.token, parsed.data.password);
  if (!res.ok) return apiError(REASON[res.reason], 400, { reason: res.reason });
  const out = NextResponse.json({ ok: true, next: "/login?reset=1" });
  out.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), expires: new Date(0) });
  return out;
}
