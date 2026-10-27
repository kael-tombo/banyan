import { destroySession, readSessionToken } from "@/lib/auth/session";
import { apiError, assertSameOrigin } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const token = await readSessionToken();
  await destroySession(token);
  const res = NextResponse.json({ ok: true, next: "/" });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", expires: new Date(0) });
  return res;
}
