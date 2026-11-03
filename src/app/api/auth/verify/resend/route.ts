import { NextRequest } from "next/server";
import { apiError, assertSameOrigin, guardRate, json } from "@/lib/api-utils";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { sendVerificationEmail } from "@/lib/auth/email-flows";
import { emailConfigured } from "@/lib/email/transport";
import { rateLimit } from "@/lib/ratelimit";

/** US-011: send a fresh confirmation link to the signed-in user (rate limited per user). */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "verify-resend", 10, 15 * 60_000);
  if (limited) return limited;
  const user = await getSessionUser(await readSessionToken());
  if (!user) return apiError("Sign in to ask for a new confirmation link.", 401);
  if (user.emailVerifiedAt) return json({ ok: true, alreadyVerified: true });
  const perUser = await rateLimit(`verify-resend-user:${user.id}`, 3, 60 * 60_000);
  if (!perUser.ok) return apiError("We already sent a few links in the last hour. Check your inbox and spam folder, or try again later.", 429);
  await sendVerificationEmail(user);
  return json({ ok: true, email: user.email, emailConfigured: emailConfigured() });
}
