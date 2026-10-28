import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { recordActivity, recordMetricEvent } from "@/lib/activity";
import { apiError, assertSameOrigin, guardRate, readJson } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { randomSlug } from "@/lib/crypto";
import { ensureDatabaseReadyOnce } from "@/lib/bootstrap/runtime-bootstrap";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = guardRate(req, "signup", 10, 60_000);
  if (limited) return limited;

  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  // Throwaway-filesystem hosts (serverless): provision schema + demo seed on
  // first use, mirroring the login route.
  await ensureDatabaseReadyOnce();

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return apiError("An account with this email already exists.", 409);

  // Attribution: if the visitor arrived via a tracked link, attribute the signup
  // (observed fact: they clicked a campaign link before registering).
  const store = await cookies();
  const visitorSlug = store.get(VISITOR_COOKIE)?.value ?? null;
  let link = visitorSlug ? await prisma.trackedLink.findUnique({ where: { slug: visitorSlug } }) : null;

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
      attributedLinkId: link?.id ?? null,
      attributedCampaignId: link?.campaignId ?? null,
      attributedSource: link ? `tracked:${link.slug}` : "direct",
    },
  });

  if (link) {
    // Visits attributed to the workspace that owns the link. A signup only
    // creates an event for the link's own workspace.
    await recordMetricEvent({
      workspaceId: link.workspaceId,
      type: "signup",
      campaignId: link.campaignId,
      linkId: link.id,
      visitorId: visitorSlug,
      userId: user.id,
    });
  }

  // Everyone gets their own workspace to start in.
  const workspace = await prisma.workspace.create({
    data: { name: `${parsed.data.name}'s workspace`, slug: `ws-${randomSlug(8)}` },
  });
  await prisma.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: "owner" } });
  await recordActivity({
    workspaceId: workspace.id,
    type: "signup",
    actorType: "user",
    summary: `New user ${email} registered${link ? " (attributed to a tracked campaign link)" : " (direct)"}.`,
    meta: { email },
  });

  const { token } = await createSession(user.id);
  // Straight into the app — setup is guided, never forced.
  const res = NextResponse.json({ ok: true, next: "/app" }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
