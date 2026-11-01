import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { attemptPublication, recordManualPublication } from "@/lib/publishing/publish";
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("now"), connectionId: z.string().nullable().optional() }),
  z.object({ mode: z.literal("schedule"), scheduledFor: z.string().datetime({ offset: true }), connectionId: z.string().nullable().optional() }),
  z.object({ mode: z.literal("manual"), liveUrl: z.string().trim().min(8).max(500) }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "publish", 30, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;

  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  if (parsed.data.mode === "manual") {
    const result = await recordManualPublication({ contentItemId: id, workspaceId: ctx.workspace.id, url: parsed.data.liveUrl });
    return result.ok ? json(result) : apiError(result.message, 400);
  }

  if (parsed.data.mode === "now") {
    const result = await attemptPublication({
      contentItemId: id,
      workspaceId: ctx.workspace.id,
      connectionId: parsed.data.connectionId ?? null,
      mode: "now",
    });
    return result.ok ? json(result) : apiError(result.message, 400, { status: result.status });
  }

  // schedule
  const result = await attemptPublication({
    contentItemId: id,
    workspaceId: ctx.workspace.id,
    connectionId: parsed.data.connectionId ?? null,
    scheduledFor: new Date(parsed.data.scheduledFor),
    mode: "schedule",
  });
  return result.ok ? json(result) : apiError(result.message, 400, { status: result.status });
}
