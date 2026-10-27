import { NextRequest, NextResponse } from "next/server";
import { recordClick } from "@/lib/analytics/links";
import { VISITOR_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Public tracked-link redirect (the destination of every link created in the
 * analytics/tracked-links workflow). Records the click as a first-party
 * "visit" event, then forwards the visitor to the real target URL.
 *
 * Safety: only http/https destinations are followed, so a stored link cannot
 * be turned into an open redirect to javascript:/data: URLs.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const home = new URL("/", req.nextUrl.origin);

  const hit = await recordClick(slug);
  if (!hit) return NextResponse.redirect(home);

  let destination: URL;
  try {
    destination = new URL(hit.targetUrl);
    if (!["http:", "https:"].includes(destination.protocol)) throw new Error("unsupported protocol");
  } catch {
    return NextResponse.redirect(home);
  }

  const res = NextResponse.redirect(destination);
  // Never cache a click-carrying redirect.
  res.headers.set("cache-control", "no-store");
  // Attribution is an observed fact: this visitor arrived via this link. If they
  // later sign up, the signup can be attributed to the same campaign.
  if (!req.cookies.get(VISITOR_COOKIE)) {
    res.cookies.set(VISITOR_COOKIE, slug, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}
