import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { recordActivity, recordMetricEvent } from "@/lib/activity";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { randomSlug } from "@/lib/crypto";
import type { OAuthIdentity } from "@/lib/auth/oauth/providers";

/**
 * Create a user with their own workspace, attributed to the tracked link
 * they arrived through (if any). Shared by password sign-up and sign-up
 * through a sign-in provider, so both produce the same account.
 */
export async function createAccount(input: {
  email: string;
  name: string;
  passwordHash: string | null;
  identity?: OAuthIdentity;
}) {
  const email = input.email.trim().toLowerCase();
  const store = await cookies();
  const visitorSlug = store.get(VISITOR_COOKIE)?.value ?? null;
  const link = visitorSlug ? await prisma.trackedLink.findUnique({ where: { slug: visitorSlug } }) : null;

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name,
      passwordHash: input.passwordHash,
      attributedLinkId: link?.id ?? null,
      attributedCampaignId: link?.campaignId ?? null,
      attributedSource: link ? `tracked:${link.slug}` : "direct",
      ...(input.identity
        ? {
            oauthAccounts: {
              create: {
                provider: input.identity.provider,
                providerAccountId: input.identity.id,
                email: input.identity.email,
                emailVerified: input.identity.emailVerified,
                displayName: input.identity.name,
                lastUsedAt: new Date(),
              },
            },
          }
        : {}),
    },
  });

  if (link) {
    await recordMetricEvent({
      workspaceId: link.workspaceId,
      type: "signup",
      campaignId: link.campaignId,
      linkId: link.id,
      visitorId: visitorSlug,
      userId: user.id,
    });
  }

  const workspace = await prisma.workspace.create({
    data: { name: `${input.name}'s workspace`, slug: `ws-${randomSlug(8)}` },
  });
  await prisma.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: "owner" } });
  const via = input.identity ? ` with ${input.identity.provider}` : "";
  await recordActivity({
    workspaceId: workspace.id,
    type: "signup",
    actorType: "user",
    summary: `New user ${email} registered${via}${link ? " (attributed to a tracked campaign link)" : " (direct)"}.`,
    meta: { email, ...(input.identity ? { provider: input.identity.provider } : {}) },
  });
  return user;
}

/** A display name for a new account: the provider's, or the email's local part. */
export function nameFor(identity: Pick<OAuthIdentity, "name">, email: string): string {
  return (identity.name || email.split("@")[0] || "Founder").slice(0, 80);
}
