import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(2000),
  source: z.enum(["assumption", "interview", "research", "observed"]).default("assumption"),
  confidence: z.enum(["low", "medium", "high"]).default("low"),
});

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const insights = await prisma.audienceInsight.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
  });
  return json({ insights });
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const parsed = await readJson(req, createSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const insight = await prisma.audienceInsight.create({
    data: { ...parsed.data, workspaceId: ctx.workspace.id },
  });
  return json({ insight }, 201);
}
