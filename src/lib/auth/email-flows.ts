import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { hashPassword } from "@/lib/auth/password";
import { consumeEmailToken, issueEmailToken, type ConsumeResult } from "@/lib/auth/email-tokens";
import { queueEmail } from "@/lib/email/outbox";

/**
 * Account email flows: verification (US-011) and password recovery (US-012).
 * Route handlers stay thin; the rules live here.
 */

const appUrl = (path: string) => `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${path}`;

export { verificationRequired, VERIFY_FIRST_MESSAGE } from "@/lib/auth/verification";

export async function sendVerificationEmail(user: { id: string; email: string; name: string; emailVerifiedAt: Date | null }): Promise<{ sent: boolean }> {
  if (user.emailVerifiedAt) return { sent: false };
  const token = await issueEmailToken(user.id, "verify");
  await queueEmail({ template: "verify_email", to: user.email, userId: user.id, data: { name: user.name, link: appUrl(`/verify-email?token=${token}`) } });
  return { sent: true };
}

export async function verifyEmail(token: string): Promise<ConsumeResult> {
  const res = await consumeEmailToken(token, "verify");
  if (res.ok) {
    await prisma.user.updateMany({ where: { id: res.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
    log("info", "auth.email_verified", { userId: res.userId });
  }
  return res;
}

/**
 * Always resolves the same way whether or not the address has an account, so
 * the response cannot be used to find out who uses Banyan. Mail failures are
 * logged and swallowed for the same reason.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
    if (!user) return;
    const token = await issueEmailToken(user.id, "reset");
    await queueEmail({ template: "reset_password", to: user.email, userId: user.id, background: true, data: { name: user.name, link: appUrl(`/reset-password?token=${token}`) } });
  } catch (err) {
    log("error", "auth.reset_request_failed", { error: (err as Error).message });
  }
}

/** Set a new password from a reset link. Every existing session is signed out. */
export async function resetPassword(token: string, newPassword: string): Promise<ConsumeResult> {
  const res = await consumeEmailToken(token, "reset");
  if (!res.ok) return res;
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    // Opening the link proves the address, so it also counts as verification.
    prisma.user.update({ where: { id: res.userId }, data: { passwordHash } }),
    prisma.user.updateMany({ where: { id: res.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: res.userId } }),
    prisma.emailToken.updateMany({ where: { userId: res.userId, purpose: "reset", usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  log("info", "auth.password_reset", { userId: res.userId });
  return res;
}
