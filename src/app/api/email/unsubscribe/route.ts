import { NextRequest } from "next/server";
import { apiError, guardRate, json } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { log } from "@/lib/log";
import { parseEmailPrefs, readUnsubscribeToken } from "@/lib/email/preferences";

/**
 * One-click unsubscribe (RFC 8058). Mail providers POST here from their own
 * servers, so there is no session and no same-origin check: the signed token
 * in the link is the authorisation, and it can only ever turn one kind of
 * optional email off for one person.
 */
export async function POST(req: NextRequest) {
  const limited = await guardRate(req, "email-unsubscribe", 30, 15 * 60_000);
  if (limited) return limited;
  const parsed = readUnsubscribeToken(req.nextUrl.searchParams.get("t") ?? "");
  if (!parsed) return apiError("This unsubscribe link is not valid.", 400);
  const user = await prisma.user.findUnique({ where: { id: parsed.userId }, select: { emailPrefs: true } });
  if (!user) return apiError("This unsubscribe link is not valid.", 400);
  const prefs = { ...parseEmailPrefs(user.emailPrefs), [parsed.key]: false };
  await prisma.user.update({ where: { id: parsed.userId }, data: { emailPrefs: JSON.stringify(prefs) } });
  log("info", "email.unsubscribed", { userId: parsed.userId, key: parsed.key });
  return json({ ok: true });
}
