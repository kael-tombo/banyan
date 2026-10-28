import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { recordActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const channelEnum = z.enum(["x", "linkedin", "shortvideo"]);
const formatEnum = z.string().max(50);

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  objective: z.string().trim().min(3).max(200),
  targetAudience: z.string().trim().min(3).max(300),
  keyMessage: z.string().trim().min(10).max(1000),
  evidence: z.string().trim().max(2000).default(""),
  cta: z.string().trim().min(3).max(200),
  channels: z.array(channelEnum).min(1).max(3),
  formats: z.array(formatEnum).min(1).max(10),
  schedule: z
    .object({
      startDate: z.string().optional().or(z.literal("")),
      cadence: z.string().optional().or(z.literal("")),
    })
    .optional(),
  successMetric: z.string().trim().min(3).max(200),
});

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
  return json({ campaigns: campaigns.map((c) => ({ ...c, itemCount: c._count.items })) });
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const parsed = await readJson(req, createSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: ctx.workspace.id,
      name: parsed.data.name,
      objective: parsed.data.objective,
      targetAudience: parsed.data.targetAudience,
      keyMessage: parsed.data.keyMessage,
      evidence: parsed.data.evidence,
      cta: parsed.data.cta,
      channels: JSON.stringify(parsed.data.channels),
      formats: JSON.stringify(parsed.data.formats),
      schedule: JSON.stringify(parsed.data.schedule ?? {}),
      successMetric: parsed.data.successMetric,
      status: "draft",
    },
  });
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "campaign",
    summary: `Campaign "${campaign.name}" created as draft.`,
    meta: { campaignId: campaign.id },
  });
  return NextResponse.json({ campaign }, { status: 201 });
}
