import crypto from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Personal access tokens for Banyan's MCP server (/api/mcp).
 *
 * A token stands for one person in one workspace and can only read: the MCP
 * tools never approve, publish, spend or change the mandate. The token is
 * shown once; only its SHA-256 hash is stored. Every use re-checks that the
 * person is still a member, so removing someone from the workspace ends
 * their tokens' access immediately.
 */

export const TOKEN_PREFIX = "bny_";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url");
}

export async function createApiToken(workspaceId: string, userId: string, name: string): Promise<{ token: string; id: string }> {
  const token = newToken();
  const row = await prisma.apiToken.create({
    data: { workspaceId, userId, name: name.trim().slice(0, 80) || "MCP client", tokenHash: hashToken(token), prefix: token.slice(0, 10) },
  });
  return { token, id: row.id };
}

export type TokenContext = {
  tokenId: string;
  user: { id: string; name: string; email: string };
  workspace: { id: string; name: string; timeZone: string };
  role: string;
};

/** Resolve a bearer token to its person and workspace, or null. */
export async function authenticateToken(authorization: string | null): Promise<TokenContext | null> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 20) return null;
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, name: true, email: true } }, workspace: { select: { id: true, name: true, timeZone: true } } },
  });
  if (!row || row.revokedAt) return null;
  const membership = await prisma.membership.findFirst({ where: { userId: row.userId, workspaceId: row.workspaceId }, select: { role: true } });
  if (!membership) return null;
  // Record use at most once a minute, so reads stay cheap.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { tokenId: row.id, user: row.user, workspace: row.workspace, role: membership.role };
}

export async function listApiTokens(workspaceId: string, userId: string) {
  return prisma.apiToken.findMany({
    where: { workspaceId, userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
  });
}

export async function revokeApiToken(workspaceId: string, userId: string, id: string): Promise<boolean> {
  const res = await prisma.apiToken.updateMany({ where: { id, workspaceId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return res.count === 1;
}
