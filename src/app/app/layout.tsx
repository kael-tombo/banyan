import { getBalance } from "@/lib/credits/service";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";
import { cookies } from "next/headers";
import { ACTIVE_PRODUCT_COOKIE, accessibleProducts, pickActiveProduct } from "@/lib/products";
import { orgCan } from "@/lib/organizations";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser(await readSessionToken());
  if (!user) redirect("/login?next=%2Fapp");

  // Onboarding is optional, not a gate: it is only required to create the
  // workspace (which signup already did). Anyone with a workspace can use the
  // app immediately; an in-app prompt guides them until setup is finished.
  // ADR-005: the active product, re-validated against everything this user can reach.
  const products = await accessibleProducts(user.id);
  const picked = pickActiveProduct(products, (await cookies()).get(ACTIVE_PRODUCT_COOKIE)?.value ?? null);
  if (!picked) redirect("/onboarding");
  const activeProfile = await prisma.productProfile.findUnique({ where: { workspaceId: picked.workspace.id } });
  const membership = { workspace: { ...picked.workspace, profile: activeProfile } };
  const orgs = await prisma.organization.findMany({ where: { id: { in: [...new Set(products.map((p) => p.workspace.organizationId))] } }, select: { id: true, name: true } });
  const orgRole = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: picked.workspace.organizationId, userId: user.id } }, select: { role: true } });
  const productList = products
    .filter((p) => p.workspace.status !== "archived" || p.workspace.id === picked.workspace.id)
    .map((p) => ({ id: p.workspace.id, name: p.workspace.name, productType: p.workspace.productType, organization: orgs.find((o) => o.id === p.workspace.organizationId)?.name ?? "" }));

  // One count for the things only a human can move: content awaiting review
  // plus execution gates paused mid-workflow. Shown in the rail and top bar.
  const [awaitingContent, awaitingGates, awaitingStrategy] = await Promise.all([
    prisma.contentItem.count({
      where: { workspaceId: membership.workspace.id, status: "ready_for_review" },
    }),
    prisma.agentTask.count({
      where: {
        workspaceId: membership.workspace.id,
        type: "approval_gate",
        status: "waiting_approval",
      },
    }),
    prisma.strategy.count({ where: { workspaceId: membership.workspace.id, status: "proposed" } }),
  ]);

  const credits = await getBalance(membership.workspace.id).catch(() => null);

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      workspace={{ id: membership.workspace.id, name: membership.workspace.name, isSelf: membership.workspace.isSelf }}
      product={membership.workspace.profile?.name || membership.workspace.name}
      products={productList}
      canCreateProduct={orgCan(orgRole?.role, "products.create")}
      goal={membership.workspace.profile?.goal ?? ""}
      // Setup is done once the wizard finished or a product profile exists: the
      // banner asks for exactly that, and the launch path covers what comes next.
      onboardingComplete={Boolean(user.onboardingCompletedAt || membership.workspace.profile)}
      attention={{ approvals: awaitingContent + awaitingGates + awaitingStrategy }}
      credits={credits?.available ?? null}
    >
      {children}
    </AppShell>
  );
}
