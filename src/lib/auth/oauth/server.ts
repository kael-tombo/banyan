import { NextResponse } from "next/server";
import { env, isProd } from "@/lib/env";
import { callbackUrl, credentialsFor, providerOptions, type ProviderId } from "./providers";
import { STATE_COOKIE, PENDING_COOKIE, STATE_TTL_MS } from "./flow";

/** Server-side glue between the pure OAuth flow and Next.js. */

const source = env as unknown as Record<string, string | undefined>;

export const oauthKey = () => env.APP_SECRET;
export const credentials = (id: ProviderId) => credentialsFor(id, source);
export const redirectUriFor = (id: ProviderId) => callbackUrl(env.NEXT_PUBLIC_APP_URL, id);

/**
 * Providers shown on the sign-in page. In production only configured ones;
 * in development every provider is shown so the buttons can be seen, and an
 * unconfigured one explains which variables it needs.
 */
export function visibleProviders() {
  const all = providerOptions(source);
  return isProd ? all.filter((p) => p.configured) : all;
}

export function stateCookie(value: string) {
  return { name: STATE_COOKIE, value, httpOnly: true, sameSite: "lax" as const, secure: isProd, path: "/api/auth/oauth", maxAge: STATE_TTL_MS / 1000 };
}

export function pendingCookie(value: string) {
  return { name: PENDING_COOKIE, value, httpOnly: true, sameSite: "lax" as const, secure: isProd, path: "/", maxAge: STATE_TTL_MS / 1000 };
}

/** Redirect to an app path on this deployment. */
export function redirectTo(path: string, params?: Record<string, string>) {
  const url = new URL(path, env.NEXT_PUBLIC_APP_URL);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  return NextResponse.redirect(url, { status: 303 });
}

/** Providers for the settings page: the visible ones plus any already linked. */
export function settingsProviders(linked: ProviderId[]) {
  const shown = new Set(visibleProviders().map((p) => p.id));
  return providerOptions(source).filter((p) => shown.has(p.id) || linked.includes(p.id));
}
