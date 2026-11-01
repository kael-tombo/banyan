import { NextRequest, NextResponse } from "next/server";
import { guardRate } from "@/lib/api-utils";
import { isProviderId } from "@/lib/auth/oauth/providers";
import { authorizeUrl, newFlowState, seal, type Intent } from "@/lib/auth/oauth/flow";
import { credentials, oauthKey, redirectTo, redirectUriFor, stateCookie } from "@/lib/auth/oauth/server";

/**
 * GET /api/auth/oauth/:provider/start?next=/app&intent=signin|link
 * Starts the provider's authorization-code flow.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const intent: Intent = req.nextUrl.searchParams.get("intent") === "link" ? "link" : "signin";
  const back = intent === "link" ? "/app/settings" : "/login";
  if (!isProviderId(provider)) return redirectTo(back, { error: "not_configured" });

  const limited = await guardRate(req, "oauth-start", 20, 60_000);
  if (limited) return limited;

  const creds = credentials(provider);
  if (!creds) return redirectTo(back, { error: "not_configured", provider });

  const flow = newFlowState(provider, intent, req.nextUrl.searchParams.get("next") || (intent === "link" ? "/app/settings" : "/app"));
  const res = NextResponse.redirect(authorizeUrl(flow, creds, redirectUriFor(provider)), { status: 302 });
  res.cookies.set(stateCookie(seal(flow, oauthKey())));
  return res;
}
