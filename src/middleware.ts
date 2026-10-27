import { NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/app", "/onboarding"];

/**
 * Edge-side presence check only; the authoritative session validation happens
 * in server components/route handlers (DB-backed session lookup).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const hasCookie = req.cookies.has("banyan_session");
    if (!hasCookie) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }
  if ((pathname === "/login" || pathname === "/signup") && req.cookies.has("banyan_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/onboarding/:path*", "/login", "/signup"],
};
