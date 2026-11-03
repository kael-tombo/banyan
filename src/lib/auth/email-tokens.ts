import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Single-use links for email verification (US-011) and password reset
 * (US-012). The raw token only ever exists in the email; the database keeps
 * a keyed hash, so a database read cannot be turned into a working link.
 * Lookup is by that hash (an index hit, not a string compare in JS), and
 * consumption is one conditional update, so a link can be used once even
 * when two requests race.
 */

export type TokenPurpose = "verify" | "reset";

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};

export function hashEmailToken(token: string, purpose: TokenPurpose): string {
  return crypto.createHmac("sha256", env.APP_SECRET).update(`email-token:${purpose}:${token}`).digest("hex");
}

/** Issue a fresh link token; earlier unused tokens for the same purpose stop working. */
export async function issueEmailToken(userId: string, purpose: TokenPurpose, now: Date = new Date()): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: now } }),
    prisma.emailToken.create({ data: { userId, purpose, tokenHash: hashEmailToken(token, purpose), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[purpose]) } }),
  ]);
  return token;
}

export type ConsumeResult = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" | "used" };

/** Use a token once. Expired and already-used tokens say so, so the page can offer the right next step. */
export async function consumeEmailToken(token: string, purpose: TokenPurpose, now: Date = new Date()): Promise<ConsumeResult> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { ok: false, reason: "invalid" };
  const tokenHash = hashEmailToken(token, purpose);
  const row = await prisma.emailToken.findUnique({ where: { tokenHash } });
  if (!row || row.purpose !== purpose) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt <= now) return { ok: false, reason: "expired" };
  const claimed = await prisma.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count === 0) return { ok: false, reason: "used" };
  return { ok: true, userId: row.userId };
}

/** The user an unusable verify token belonged to, so an expired link can still offer "send a new one". */
export async function tokenOwner(token: string, purpose: TokenPurpose): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: hashEmailToken(token, purpose) }, select: { userId: true } });
  return row?.userId ?? null;
}
