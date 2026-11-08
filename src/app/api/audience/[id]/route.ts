import { requireRole } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  body: z.string().trim().min(3).max(2000).optional(),
  source: z.enum(["assumption", "interview", "research", "observed"]).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;
  const existing = await prisma.audienceInsight.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return apiError("Insight not found.", 404);
  const parsed = await readJson(req, patchSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const insight = await prisma.audienceInsight.update({ where: { id }, data: parsed.data });
  return json({ insight });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;
  const existing = await prisma.audienceInsight.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return apiError("Insight not found.", 404);
  await prisma.audienceInsight.delete({ where: { id } });
  return json({ ok: true });
}
