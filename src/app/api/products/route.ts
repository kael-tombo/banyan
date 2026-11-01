import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { recordActivity } from "@/lib/activity";
import { accessibleProducts, ACTIVE_PRODUCT_COOKIE } from "@/lib/products";
import { orgCan, PRODUCT_TYPE_KEYS, productSlug } from "@/lib/organizations";
import { activeProductCookie } from "@/lib/product-cookie";

/** BOS-011: every product this person can reach, with the active one marked. */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const products = await accessibleProducts(ctx.user.id);
  const orgs = await prisma.organization.findMany({ where: { id: { in: [...new Set(products.map((p) => p.workspace.organizationId))] } }, select: { id: true, name: true } });
  return json({
    products: products.map((p) => ({
      id: p.workspace.id,
      name: p.workspace.name,
      productType: p.workspace.productType,
      status: p.workspace.status,
      organization: { id: p.workspace.organizationId, name: orgs.find((o) => o.id === p.workspace.organizationId)?.name ?? "" },
      role: p.role,
      active: p.workspace.id === ctx.workspace.id,
    })),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name the product.").max(80),
  productType: z.enum(PRODUCT_TYPE_KEYS).default("saas"),
});

/**
 * BOS-008: create a product in the active product's organization. The
 * organization comes from the server-side context, never from the body; only
 * its OWNER/ADMIN may create. Product and membership are created together.
 */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "products-create", 10, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const organizationId = ctx.workspace.organizationId;
  const orgMember = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: ctx.user.id } }, select: { role: true } });
  if (!orgCan(orgMember?.role, "products.create")) return apiError("Only the organization's owners and admins can create products.", 403);
  const parsed = await readJson(req, createSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timeZone: true, name: true } });
  const product = await prisma.$transaction(async (tx) => {
    const w = await tx.workspace.create({
      data: { organizationId, name: parsed.data.name, slug: productSlug(parsed.data.name), productType: parsed.data.productType, timeZone: org.timeZone },
    });
    await tx.membership.create({ data: { userId: ctx.user.id, workspaceId: w.id, role: "owner" } });
    return w;
  });
  await recordActivity({
    workspaceId: product.id,
    type: "organization",
    actorType: "user",
    actorSummary: ctx.user.name,
    summary: `${ctx.user.name} created the product "${product.name}" in ${org.name}.`,
    meta: { organizationId, productId: product.id },
  });
  // Land in the new product (BOS-008 step 9).
  const res = NextResponse.json({ product: { id: product.id, name: product.name, productType: product.productType } }, { status: 201 });
  res.cookies.set(ACTIVE_PRODUCT_COOKIE, product.id, activeProductCookie());
  return res;
}
