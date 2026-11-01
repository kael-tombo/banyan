import { prisma } from "@/lib/db";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { Membership, ProductProfile, User, Workspace } from "@prisma/client";
import { cookies } from "next/headers";
import { ACTIVE_PRODUCT_COOKIE, resolveActiveProduct } from "@/lib/products";

export type ServerContext = { user: User; workspace: Workspace; membership: Membership; profile: ProductProfile | null };

/** Server-component variant of requireWorkspace; redirects when unauthenticated. */
export async function requireWorkspaceServer(): Promise<Omit<ServerContext, "profile"> & { profile: ProductProfile | null }> {
  const user = await getSessionUser(await readSessionToken());
  if (!user) throw new Error("UNAUTHENTICATED");
  // ADR-005: the active product (cookie preference, re-validated against what this user can reach).
  const preferred = (await cookies()).get(ACTIVE_PRODUCT_COOKIE)?.value ?? null;
  const active = await resolveActiveProduct(user.id, preferred);
  if (!active) throw new Error("WORKSPACE_NOT_FOUND");
  const profile = await prisma.productProfile.findUnique({ where: { workspaceId: active.workspace.id } });
  return { user, workspace: active.workspace, membership: active.membership, profile };
}
