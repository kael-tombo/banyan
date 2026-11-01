import { destroySession, readSessionToken } from "@/lib/auth/session";
import { apiError, assertSameOrigin } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const token = await readSessionToken();
  await destroySession(token);
  const res = NextResponse.json({ ok: true, next: "/" });
  // Same attributes as when it was set, or a partitioned cookie survives.
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), expires: new Date(0) });
  return res;
}
