/**
 * How soon a connected account needs reconnecting. LinkedIn member tokens
 * last about 60 days and cannot be refreshed, so a founder should hear about
 * it before a scheduled post fails, not after.
 */

export const EXPIRY_WARNING_DAYS = 14;

export type ExpiryNote = { tone: "ok" | "soon" | "expired"; text: string } | null;

export function expiryNote(tokenExpiresAt: string | Date | null | undefined, now: Date = new Date()): ExpiryNote {
  if (!tokenExpiresAt) return null;
  const at = new Date(tokenExpiresAt);
  if (Number.isNaN(at.getTime())) return null;
  const ms = at.getTime() - now.getTime();
  if (ms <= 0) return { tone: "expired", text: "Access expired. Reconnect to keep publishing." };
  const days = Math.ceil(ms / 86_400_000);
  if (days <= EXPIRY_WARNING_DAYS) {
    return { tone: "soon", text: `Access ends in ${days} day${days === 1 ? "" : "s"}. Reconnect before then so scheduled posts keep going out.` };
  }
  return { tone: "ok", text: `Access until ${at.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}.` };
}
