import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace } from "@/lib/api-utils";
import { adapterFor, configFromConnection } from "@/lib/publishing/publish";
import { recordActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const connection = await prisma.channelConnection.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!connection) return apiError("Connection not found.", 404);
  await prisma.channelConnection.delete({ where: { id } });
  await recordActivity({ workspaceId: ctx.workspace.id, type: "connection", summary: `${connection.label} disconnected.` });
  return json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Re-test the connection.
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const connection = await prisma.channelConnection.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!connection) return apiError("Connection not found.", 404);
  const adapter = adapterFor(connection.adapter);
  if (!adapter) return apiError("Unknown adapter.", 400);
  const check = await adapter.validateConnection(configFromConnection(connection));
  const updated = await prisma.channelConnection.update({
    where: { id: connection.id },
    data: { status: check.ok ? "verified" : "error", lastCheckedAt: new Date(), lastError: check.ok ? null : check.detail },
  });
  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "connection",
    actorType: "system",
    summary: `${connection.label} re-tested: ${check.ok ? "verified" : check.detail}`,
  });
  return NextResponse.json({ check, status: updated.status, detail: check.detail });
}
