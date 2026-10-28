import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, parseJson, requireWorkspace } from "@/lib/api-utils";
import { recordActivity } from "@/lib/activity";
import { requireRole } from "@/lib/permissions";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

/**
 * Persistent business context with explicit provenance. Users can add and
 * correct facts; provenance is always preserved and honestly updated:
 * user corrections become "user_provided" (high confidence), and a user can
 * mark any fact "verified".
 */

const CATEGORIES = ["product", "audience", "positioning", "voice", "competitor", "constraint", "resource", "metric", "research"] as const;
const PROVENANCE = ["verified", "user_provided", "external_observation", "hypothesis"] as const;

const createSchema = z.object({
  category: z.enum(CATEGORIES),
  key: z.string().trim().min(2).max(80).regex(/^[a-z0-9:_-]+$/i, "Key may contain letters, numbers, :, _ and -"),
  value: z.string().trim().min(1).max(2000),
  provenance: z.enum(PROVENANCE).default("user_provided"),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  source: z.string().trim().max(200).optional(),
});

const patchSchema = z.object({
  value: z.string().trim().min(1).max(2000).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  markVerified: z.boolean().optional(),
});

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const facts = await prisma.profileFact.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
  });
  return json({ facts });
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = guardRate(req, "facts-create", 60, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);

  const parsed = await parseJson(createSchema, await req.json());
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const fact = await prisma.profileFact.upsert({
    where: {
      workspaceId_category_key: {
        workspaceId: ctx.workspace.id,
        category: parsed.data.category,
        key: parsed.data.key,
      },
    },
    create: {
      workspaceId: ctx.workspace.id,
      category: parsed.data.category,
      key: parsed.data.key,
      value: parsed.data.value,
      provenance: parsed.data.provenance,
      confidence: parsed.data.confidence,
      source: parsed.data.source ?? "user entry",
      createdBy: `user:${ctx.user.id}`,
    },
    update: {
      value: parsed.data.value,
      provenance: parsed.data.provenance,
      confidence: parsed.data.confidence,
      source: parsed.data.source ?? "user entry",
      verifiedAt: parsed.data.provenance === "verified" ? new Date() : null,
    },
  });
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "goal",
    summary: `Business context updated: ${fact.category}/${fact.key} (${fact.provenance.replace(/_/g, " ")}).`,
    meta: { factId: fact.id },
  });
  return NextResponse.json({ fact }, { status: 201 });
}
