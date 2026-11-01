import { apiError, assertSameOrigin, guardRate, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { startAnalysis, getAnalysis } from "@/lib/product/analysis-runner";
import { NextRequest } from "next/server";
import { z } from "zod";

/**
 * Start a product website analysis (US-021). Private, internal and non-web
 * addresses are refused before any request. With the job queue the analysis
 * runs in the worker and the client polls GET /api/product/analyze/[id];
 * without it, it runs inline and the response is already final.
 */
const schema = z.object({ url: z.string().trim().min(3).max(400) });

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "product-analyze", 8, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);

  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const started = await startAnalysis(ctx.workspace.id, parsed.data.url);
  if (!started.ok) return json({ error: started.message, code: started.code }, started.status);
  return json({ analysis: await getAnalysis(ctx.workspace.id, started.analysisId) }, 202);
}
