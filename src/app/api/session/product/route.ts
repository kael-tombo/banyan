import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin, readJson } from "@/lib/api-utils";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { accessibleProducts, ACTIVE_PRODUCT_COOKIE } from "@/lib/products";
import { activeProductCookie } from "@/lib/product-cookie";

const schema = z.object({ productId: z.string().trim().min(1).max(64) });

/** BOS-009: switch the active product — only to one this person can reach. */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await readSessionToken());
  if (!user) return apiError("Unauthorized", 401);
  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const target = (await accessibleProducts(user.id)).find((p) => p.workspace.id === parsed.data.productId);
  // Same answer for "does not exist" and "not yours": no product enumeration.
  if (!target) return apiError("Product not found.", 404);
  const res = NextResponse.json({ product: { id: target.workspace.id, name: target.workspace.name } });
  res.cookies.set(ACTIVE_PRODUCT_COOKIE, target.workspace.id, activeProductCookie());
  return res;
}
