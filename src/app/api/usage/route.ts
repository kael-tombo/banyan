import { apiError, json, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { usageSummary } from "@/lib/model/router";
import { NextRequest } from "next/server";

/** Model usage and quota state for the caller's workspace (server-side only). */
export async function GET(req: NextRequest) {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "read");
  if (forbidden) return apiError(forbidden, 403);
  const sinceParam = req.nextUrl.searchParams.get("days");
  const days = Math.min(90, Math.max(1, Number(sinceParam) || 30));
  const since = new Date(Date.now() - days * 86_400_000);
  const summary = await usageSummary(ctx.workspace.id, since);
  return json({ windowDays: days, ...summary });
}
