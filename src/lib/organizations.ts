import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { randomSlug } from "@/lib/crypto";

/**
 * Organizations (ADR-005, BOS-001/003): the founder's business, owning
 * products (workspaces), members and — later — the credit balance.
 */

export const ORG_ROLES = ["OWNER", "ADMIN", "MEMBER", "BILLING_MANAGER"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PRODUCT_TYPES = [
  { key: "saas", label: "SaaS" },
  { key: "web_app", label: "Web application" },
  { key: "mobile_app", label: "Mobile application" },
  { key: "ecommerce", label: "E-commerce" },
  { key: "developer_tool", label: "Developer tool" },
  { key: "digital_product", label: "Digital product" },
  { key: "agency_service", label: "Agency service" },
  { key: "personal_brand", label: "Personal brand" },
  { key: "other", label: "Other" },
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number]["key"];
export const PRODUCT_TYPE_KEYS = PRODUCT_TYPES.map((t) => t.key) as [ProductType, ...ProductType[]];
export const productTypeLabel = (k: string) => PRODUCT_TYPES.find((t) => t.key === k)?.label ?? "Other";

export type OrgAction =
  | "products.access_all" // see and work in every product of the organization
  | "products.create"
  | "products.archive"
  | "members.invite"
  | "members.change_role"
  | "settings.edit"
  | "billing.view"
  | "billing.manage";

const POLICY: Record<OrgRole, readonly OrgAction[]> = {
  OWNER: ["products.access_all", "products.create", "products.archive", "members.invite", "members.change_role", "settings.edit", "billing.view", "billing.manage"],
  ADMIN: ["products.access_all", "products.create", "products.archive", "members.invite", "members.change_role", "settings.edit", "billing.view"],
  MEMBER: [],
  BILLING_MANAGER: ["billing.view", "billing.manage"],
};

export function isOrgRole(v: string): v is OrgRole {
  return (ORG_ROLES as readonly string[]).includes(v);
}

/** Pure organization policy. Product roles never grant any of these. */
export function orgCan(role: string | null | undefined, action: OrgAction): boolean {
  return role != null && isOrgRole(role) && POLICY[role].includes(action);
}

export function orgSlug(name: string): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "org";
  return `${base}-${randomSlug(6)}`;
}

export function productSlug(name: string): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "product";
  return `${base}-${randomSlug(6)}`;
}

type Tx = Prisma.TransactionClient;

/** An organization with its founder as OWNER and a first product they administer — all or nothing. */
export async function createOrganizationWithProduct(
  input: { userId: string; organizationName: string; productName: string; productType?: ProductType; timeZone?: string; productSlug?: string; isSelf?: boolean },
  tx?: Tx
) {
  const run = async (db: Tx) => {
    const organization = await db.organization.create({
      data: { name: input.organizationName.slice(0, 80), slug: orgSlug(input.organizationName), timeZone: input.timeZone ?? "UTC" },
    });
    await db.organizationMember.create({ data: { organizationId: organization.id, userId: input.userId, role: "OWNER" } });
    const product = await db.workspace.create({
      data: {
        organizationId: organization.id,
        name: input.productName.slice(0, 80),
        slug: input.productSlug ?? productSlug(input.productName),
        productType: input.productType ?? "saas",
        timeZone: input.timeZone ?? "UTC",
        isSelf: input.isSelf ?? false,
      },
    });
    await db.membership.create({ data: { userId: input.userId, workspaceId: product.id, role: "owner" } });
    return { organization, product };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}
