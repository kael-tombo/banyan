import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { z } from "zod";
import { NextRequest } from "next/server";

const patchSchema = z.object({
  value: z.string().trim().min(1).max(2000).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  markVerified: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = guardRate(req, "facts-patch", 60, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;

  const fact = await prisma.profileFact.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!fact) return apiError("Not found", 404);

  const parsed = await readJson(req, patchSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const data = parsed.data;

  const update: Record<string, unknown> = {};
  if (data.value !== undefined) {
    update.value = data.value;
    // A user correction is user-provided information with elevated confidence —
    // and it resets verification honestly.
    update.provenance = "user_provided";
    update.source = `user correction by ${ctx.user.email}`;
    update.createdBy = `user:${ctx.user.id}`;
    update.verifiedAt = null;
  }
  if (data.confidence) update.confidence = data.confidence;
  if (data.markVerified) {
    update.provenance = "verified";
    update.verifiedAt = new Date();
    update.source = `verified by ${ctx.user.email}`;
  }

  const updated = await prisma.profileFact.update({ where: { id }, data: update });
  return json({ fact: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;
  const fact = await prisma.profileFact.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!fact) return apiError("Not found", 404);
  await prisma.profileFact.delete({ where: { id } });
  return json({ ok: true });
}
