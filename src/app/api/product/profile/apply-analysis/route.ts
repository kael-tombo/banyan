import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { recordActivity } from "@/lib/activity";
import { mergeAnalysis, approvalState, editBump } from "@/lib/product/profile-review";
import { analysisSchema } from "@/lib/product/analyze";
import { NextRequest } from "next/server";
import { z } from "zod";

/**
 * Apply a finished website analysis to the product profile as a draft
 * (US-023). Fields the founder wrote are kept; the result needs approval
 * before strategy work.
 */
const schema = z.object({ analysisId: z.string().min(1).max(60) });

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const analysis = await prisma.productAnalysis.findFirst({ where: { id: parsed.data.analysisId, workspaceId: ctx.workspace.id } });
  if (!analysis) return apiError("Analysis not found.", 404);
  if (analysis.status !== "ready" || !analysis.result) return apiError("This analysis has not finished.", 409);
  const result = analysisSchema.safeParse(JSON.parse(analysis.result));
  if (!result.success) return apiError("This analysis result is not valid.", 409);

  const current = await prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } });
  const merge = mergeAnalysis(current, result.data);
  const data = { ...merge.data, lastAnalysisId: analysis.id, ...(current ? editBump(current) : {}) };

  const profile = current
    ? await prisma.productProfile.update({ where: { workspaceId: ctx.workspace.id }, data })
    : await prisma.productProfile.create({
        data: {
          workspaceId: ctx.workspace.id,
          name: merge.data.name ?? "",
          description: merge.data.description ?? "",
          website: analysis.url,
          stage: "building",
          problem: "",
          valueProp: merge.data.valueProp ?? "",
          ...data,
        },
      });

  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "profile",
    summary: `Website analysis applied to the product profile as a draft (${merge.filled.length} field(s) filled, ${merge.kept.length} kept as you wrote them).`,
    meta: { analysisId: analysis.id, filled: merge.filled, kept: merge.kept },
  });
  return json({ filled: merge.filled, kept: merge.kept, version: profile.version, approval: approvalState(profile) });
}
