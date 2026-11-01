/**
 * BOS-009/010/066 against a real database: who can reach which product, what
 * a forged active-product preference resolves to, and that one product's data
 * never shows up in another. Creates two throwaway organizations and deletes
 * them at the end.
 *
 *   npx tsx --env-file=.env scripts/multi-product-check.ts
 */
import { prisma } from "@/lib/db";
import { accessibleProducts, resolveActiveProduct } from "@/lib/products";
import { createOrganizationWithProduct, orgCan } from "@/lib/organizations";

async function main() {
  let failures = 0;
  const check = (ok: boolean, label: string, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
  };
  const stamp = Date.now();
  const mk = (n: string) => prisma.user.create({ data: { email: `mp-${n}-${stamp}@check.local`, name: n } });
  const [owner, admin, member, outsider] = await Promise.all([mk("owner"), mk("admin"), mk("member"), mk("outsider")]);
  const orgIds: string[] = [];
  try {
    // Org 1: owner's organization with Product A; then Product B in the same org.
    const { organization: org1, product: A } = await createOrganizationWithProduct({ userId: owner.id, organizationName: "Founder Co", productName: "Product A", productType: "saas" });
    orgIds.push(org1.id);
    const B = await prisma.workspace.create({ data: { organizationId: org1.id, name: "Product B", slug: `pb-${stamp}`, productType: "mobile_app" } });
    await prisma.membership.create({ data: { userId: owner.id, workspaceId: B.id, role: "owner" } });
    await prisma.organizationMember.create({ data: { organizationId: org1.id, userId: admin.id, role: "ADMIN" } }); // no product memberships
    await prisma.organizationMember.create({ data: { organizationId: org1.id, userId: member.id, role: "MEMBER" } });
    await prisma.membership.create({ data: { userId: member.id, workspaceId: A.id, role: "member" } }); // A only
    // Org 2: the outsider's own organization.
    const { organization: org2, product: X } = await createOrganizationWithProduct({ userId: outsider.id, organizationName: "Other Co", productName: "Product X" });
    orgIds.push(org2.id);

    const ids = async (u: { id: string }) => (await accessibleProducts(u.id)).map((p) => p.workspace.id).sort();
    check(JSON.stringify(await ids(owner)) === JSON.stringify([A.id, B.id].sort()), "the owner reaches A and B");
    check(JSON.stringify(await ids(admin)) === JSON.stringify([A.id, B.id].sort()), "an org ADMIN reaches every product without product memberships");
    check(JSON.stringify(await ids(member)) === JSON.stringify([A.id]), "an org MEMBER reaches only the product they belong to");
    check(JSON.stringify(await ids(outsider)) === JSON.stringify([X.id]), "an outsider reaches only their own product");

    const adminCtx = await resolveActiveProduct(admin.id, B.id);
    check(adminCtx?.workspace.id === B.id && adminCtx.membership.role === "owner", "an ADMIN acts in B with full product rights", adminCtx?.membership.role);
    check((await resolveActiveProduct(member.id, B.id))?.workspace.id === A.id, "a member's forged preference for B falls back to A");
    check((await resolveActiveProduct(outsider.id, A.id))?.workspace.id === X.id, "an outsider's forged preference for A falls back to their own product");
    check((await resolveActiveProduct(owner.id, B.id))?.workspace.id === B.id, "the owner can switch to B");

    // Data isolation: a campaign in A is invisible when working in B.
    await prisma.campaign.create({ data: { workspaceId: A.id, name: "A launch", objective: "o", targetAudience: "t", keyMessage: "k", cta: "c", successMetric: "signups" } });
    const inB = await resolveActiveProduct(owner.id, B.id);
    const visibleInB = await prisma.campaign.count({ where: { workspaceId: inB!.workspace.id } });
    const visibleInA = await prisma.campaign.count({ where: { workspaceId: (await resolveActiveProduct(owner.id, A.id))!.workspace.id } });
    check(visibleInA === 1 && visibleInB === 0, "a campaign in A is visible in A and not in B", `A=${visibleInA} B=${visibleInB}`);

    // Removing someone's product membership ends their access at once.
    await prisma.membership.deleteMany({ where: { userId: member.id, workspaceId: A.id } });
    check((await accessibleProducts(member.id)).length === 0, "removing the member's product membership ends their access");
    check((await resolveActiveProduct(member.id, A.id)) === null, "with no product left, there is no context at all (no fallback to someone else's)");

    // Product creation is an org action: a product owner without an org role cannot create products.
    const ownerOrgRole = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: org1.id, userId: owner.id } } });
    check(orgCan(ownerOrgRole?.role, "products.create"), "the org OWNER may create products");
    check(!orgCan("MEMBER", "products.create") && !orgCan("owner", "products.create"), "a MEMBER, or a product-level owner role, may not");
  } finally {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, admin.id, member.id, outsider.id] } } });
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
