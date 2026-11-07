import { NextRequest } from "next/server";
import { apiError, assertSameOrigin, guardRate, json, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { runTrends } from "@/lib/research/runner";

/**
 * Onboarding trend radar: what is getting attention around the product on
 * each platform (live where an official API is configured; research links
 * where none exists), interest from Wikipedia page views, and platform-native
 * content ideas. Runs after the market scan; see docs/ONBOARDING_360.md.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  // Each run makes up to ~20 outbound requests and spends YouTube quota when configured.
  const limited = await guardRate(req, "product-trends", 6, 10 * 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;
  const out = await runTrends(ctx.workspace.id, id);
  if (!out.ok) return apiError(out.message, out.status);
  return json({ trends: out.trends });
}
