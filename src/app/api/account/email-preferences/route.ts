import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin, json, readJson } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { parseEmailPrefs } from "@/lib/email/preferences";

const schema = z.object({ autonomyDigest: z.boolean() });

/** The signed-in person's own optional-email preferences. */
export async function GET() {
  const user = await getSessionUser(await readSessionToken());
  if (!user) return apiError("Unauthorized", 401);
  return json({ prefs: parseEmailPrefs(user.emailPrefs) });
}

export async function PUT(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await readSessionToken());
  if (!user) return apiError("Unauthorized", 401);
  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const prefs = { ...parseEmailPrefs(user.emailPrefs), ...parsed.data };
  await prisma.user.update({ where: { id: user.id }, data: { emailPrefs: JSON.stringify(prefs) } });
  return json({ prefs });
}
