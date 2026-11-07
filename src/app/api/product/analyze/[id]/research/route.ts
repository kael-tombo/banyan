import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin, guardRate, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { runResearch } from "@/lib/research/runner";

/**
 * Onboarding 360: scan the market around an analysed product (competitors'
 * sites, Hacker News, Stack Overflow) and derive cited opportunities. The
 * founder may resend it with their own search terms or competitor list.
 * Only search terms and competitor domains leave Banyan; nothing is posted.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  queries: z.array(z.string().trim().min(2).max(60)).max(5).optional(),
  competitors: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        domain: z.string().trim().max(200).optional(),
        source: z.enum(["named_on_site", "suggested", "added"]).optional(),
        reason: z.string().trim().max(240).optional(),
      }),
    )
    .max(6)
    .optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  // Each scan makes ~10 outbound requests and up to two model calls.
  const limited = await guardRate(req, "product-research", 6, 10 * 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const { id } = await params;
  const out = await runResearch(ctx.workspace.id, id, parsed.data);
  if (!out.ok) return apiError(out.message, out.status);
  return json({ research: out.research });
}
