import type { Membership, Workspace } from "@prisma/client";
import { prisma } from "@/lib/db";
import { orgCan } from "@/lib/organizations";

/**
 * Products and the active product (ADR-005, BOS-009/010/011).
 *
 * A product is a Workspace row. A user can reach a product when they hold a
 * product membership in it, or when they are OWNER/ADMIN of its organization
 * (who act with full product rights). The active product is a cookie
 * *preference*: it is re-checked against this list on every request, and a
 * cookie naming anything else falls back to a product the user can reach —
 * never to someone else's.
 */

export const ACTIVE_PRODUCT_COOKIE = "banyan_product";

export type AccessibleProduct = {
  workspace: Workspace;
  /** Effective product role: the membership's, or "owner" through org OWNER/ADMIN. */
  role: string;
  via: "membership" | "organization";
  membership: Membership | null;
};

export async function accessibleProducts(userId: string): Promise<AccessibleProduct[]> {
  const [memberships, orgMembers] = await Promise.all([
    prisma.membership.findMany({ where: { userId }, include: { workspace: true }, orderBy: { id: "asc" } }),
    prisma.organizationMember.findMany({ where: { userId }, select: { organizationId: true, role: true } }),
  ]);
  const byId = new Map<string, AccessibleProduct>();
  for (const m of memberships) {
    const { workspace, ...membership } = m;
    byId.set(workspace.id, { workspace, role: membership.role, via: "membership", membership });
  }
  const adminOrgs = orgMembers.filter((m) => orgCan(m.role, "products.access_all")).map((m) => m.organizationId);
  if (adminOrgs.length) {
    const orgProducts = await prisma.workspace.findMany({ where: { organizationId: { in: adminOrgs } }, orderBy: { createdAt: "asc" } });
    for (const w of orgProducts) {
      const existing = byId.get(w.id);
      // Org OWNER/ADMIN act with full product rights, even when their product membership is narrower.
      byId.set(w.id, { workspace: w, role: "owner", via: existing ? existing.via : "organization", membership: existing?.membership ?? null });
    }
  }
  return [...byId.values()];
}

/** The membership-shaped object routes already use (ctx.membership.role, ctx.membership.workspaceId). */
function effectiveMembership(userId: string, p: AccessibleProduct): Membership {
  return { ...(p.membership ?? { id: `org:${p.workspace.organizationId}:${userId}`, userId, workspaceId: p.workspace.id }), role: p.role, workspaceId: p.workspace.id } as Membership;
}

/**
 * Pick the product a request works in: the preferred one if the user can
 * reach it, else their first active product (membership order, then
 * organization products), else any reachable product.
 */
export function pickActiveProduct(products: AccessibleProduct[], preferredId: string | null | undefined): AccessibleProduct | null {
  if (!products.length) return null;
  const preferred = preferredId ? products.find((p) => p.workspace.id === preferredId) : undefined;
  if (preferred) return preferred;
  return products.find((p) => p.workspace.status !== "archived") ?? products[0];
}

export async function resolveActiveProduct(userId: string, preferredId: string | null | undefined): Promise<{ workspace: Workspace; membership: Membership } | null> {
  const picked = pickActiveProduct(await accessibleProducts(userId), preferredId);
  return picked ? { workspace: picked.workspace, membership: effectiveMembership(userId, picked) } : null;
}
