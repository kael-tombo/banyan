import { prisma } from "@/lib/db";
import { emailConfigured } from "@/lib/email/transport";

/**
 * The email-verification gate (US-011), kept free of the mail outbox so the
 * publishing core can import it without pulling in the send path.
 *
 * Verification is only required where the deployment can actually send the
 * link. Without SMTP nobody could ever verify, so nothing is gated, and the
 * UI says email is not configured instead.
 */
export function verificationRequired(user: { emailVerifiedAt: Date | null }): boolean {
  return emailConfigured() && !user.emailVerifiedAt;
}

export const VERIFY_FIRST_MESSAGE = "Confirm your email address first. We sent you a link; you can ask for a new one from the banner at the top of the app.";

/**
 * Every publish path (manual, scheduled, autopilot, campaign launch) ends in
 * the publishing core, which has a workspace but no acting user. Banyan
 * publishes in the workspace owner's name, so the owner must be confirmed.
 */
export async function workspacePublishingBlocked(workspaceId: string): Promise<boolean> {
  if (!emailConfigured()) return false;
  const verifiedOwner = await prisma.membership.findFirst({
    where: { workspaceId, role: "owner", user: { emailVerifiedAt: { not: null } } },
    select: { id: true },
  });
  return !verifiedOwner;
}
