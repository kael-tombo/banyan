import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Email preferences and signed unsubscribe links (STRATEGY.md Level 2 weekly
 * digest; groundwork for US-073). Transactional mail (confirmation, password
 * reset) is not optional and has no preference; summaries are, and every one
 * carries a link that turns itself off without signing in.
 */

export type EmailPrefs = { autonomyDigest: boolean };
export type EmailPrefKey = keyof EmailPrefs;

export const DEFAULT_EMAIL_PREFS: EmailPrefs = { autonomyDigest: true };
export const EMAIL_PREF_KEYS: EmailPrefKey[] = ["autonomyDigest"];

export function parseEmailPrefs(raw: string | null | undefined): EmailPrefs {
  try {
    const v = JSON.parse(raw || "{}") as Partial<EmailPrefs>;
    return { autonomyDigest: typeof v.autonomyDigest === "boolean" ? v.autonomyDigest : DEFAULT_EMAIL_PREFS.autonomyDigest };
  } catch {
    return { ...DEFAULT_EMAIL_PREFS };
  }
}

function sign(userId: string, key: EmailPrefKey): string {
  return crypto.createHmac("sha256", env.APP_SECRET).update(`email-unsubscribe:${userId}:${key}`).digest("base64url");
}

/** A token that turns off one kind of email for one user. It does not expire: an old email's link must keep working. */
export function unsubscribeToken(userId: string, key: EmailPrefKey): string {
  return `${userId}.${key}.${sign(userId, key)}`;
}

export function readUnsubscribeToken(token: string): { userId: string; key: EmailPrefKey } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, key, sig] = parts;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId) || !EMAIL_PREF_KEYS.includes(key as EmailPrefKey)) return null;
  const expected = Buffer.from(sign(userId, key as EmailPrefKey));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return { userId, key: key as EmailPrefKey };
}

export const unsubscribeUrl = (userId: string, key: EmailPrefKey) =>
  `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/unsubscribe?t=${encodeURIComponent(unsubscribeToken(userId, key))}`;

/** The endpoint mail clients POST to for one-click unsubscribe (RFC 8058). */
export const oneClickUnsubscribeUrl = (userId: string, key: EmailPrefKey) =>
  `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/email/unsubscribe?t=${encodeURIComponent(unsubscribeToken(userId, key))}`;
