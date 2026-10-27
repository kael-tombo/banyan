import { prisma } from "@/lib/db";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { Membership, ProductProfile, User, Workspace } from "@prisma/client";

export type ServerContext = { user: User; workspace: Workspace; membership: Membership; profile: ProductProfile | null };

/** Server-component variant of requireWorkspace; redirects when unauthenticated. */
export async function requireWorkspaceServer(): Promise<Omit<ServerContext, "profile"> & { profile: ProductProfile | null }> {
  const user = await getSessionUser(await readSessionToken());
  if (!user) throw new Error("UNAUTHENTICATED");
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { id: "asc" },
  });
  if (!membership) throw new Error("WORKSPACE_NOT_FOUND");
  const profile = await prisma.productProfile.findUnique({ where: { workspaceId: membership.workspace.id } });
  return { user, workspace: membership.workspace, membership, profile };
}
