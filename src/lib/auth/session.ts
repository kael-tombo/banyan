import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { env, isProd } from "@/lib/env";

export const SESSION_COOKIE = "banyan_session";
export const VISITOR_COOKIE = "banyan_vis";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  // APP_SECRET binds tokens to this deployment (keyed hash). env.ts has
  // already validated it (64 hex chars) — fail-fast, no silent fallback.
  return crypto.createHmac("sha256", env.APP_SECRET).update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

/**
 * Production: SameSite=Lax, Secure.
 *
 * Development only: SameSite=None; Secure; Partitioned. Embedded previews
 * (Ship Studio shows the app inside its own window) are a cross-site frame,
 * and browsers refuse to store a Lax cookie set there, so sign-in silently
 * fails. Chrome treats http://localhost as a secure context, so Secure works
 * without HTTPS, and Partitioned (CHIPS) keeps the cookie allowed in a frame.
 * Mutating requests are still origin-checked (assertSameOrigin).
 */
export function sessionCookieOptions() {
  const embeddable = env.NODE_ENV === "development";
  return {
    httpOnly: true,
    sameSite: embeddable ? ("none" as const) : ("lax" as const),
    secure: isProd || embeddable,
    ...(embeddable ? { partitioned: true } : {}),
    path: "/",
    expires: new Date(Date.now() + SESSION_TTL_MS),
  };
}

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Read the session token from cookies() in a server component / route handler. */
export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}
