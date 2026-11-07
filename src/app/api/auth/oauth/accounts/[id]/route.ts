import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin } from "@/lib/api-utils";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

/**
 * DELETE /api/auth/oauth/accounts/:id — disconnect a sign-in provider.
 * Refused when it is the only way left to sign in.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return apiError("Sign in first.", 401);
  const { id } = await params;

  const account = await prisma.oAuthAccount.findFirst({ where: { id, userId: user.id } });
  if (!account) return apiError("Not found.", 404);
  const others = await prisma.oAuthAccount.count({ where: { userId: user.id, id: { not: id } } });
  if (!user.passwordHash && others === 0) {
    return apiError("This is your only way to sign in. Connect another provider before disconnecting it.", 409, { code: "last_method" });
  }
  await prisma.oAuthAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
