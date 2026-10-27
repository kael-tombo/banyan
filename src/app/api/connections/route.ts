import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, parseJson, requireWorkspace } from "@/lib/api-utils";
import { encryptSecret } from "@/lib/crypto";
import { adapterFor, configFromConnection } from "@/lib/publishing/publish";
import { recordActivity } from "@/lib/activity";
import { NextRequest } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  channel: z.enum(["x", "linkedin"]),
  adapter: z.enum(["postiz"]),
  label: z.string().trim().max(120).default(""),
  baseUrl: z.string().trim().url().max(300),
  apiKey: z.string().trim().min(4).max(400),
  integrationIds: z.record(z.string()).default({}),
});

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const connections = await prisma.channelConnection.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
  });
  return json({
    connections: connections.map((c) => ({
      id: c.id,
      channel: c.channel,
      adapter: c.adapter,
      label: c.label,
      status: c.status,
      lastCheckedAt: c.lastCheckedAt,
      lastError: c.lastError,
      createdAt: c.createdAt,
      hasKey: true,
    })),
  });
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const parsed = await parseJson(createSchema, await req.json());
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const exists = await prisma.channelConnection.findFirst({ where: { workspaceId: ctx.workspace.id, channel: parsed.data.channel, adapter: parsed.data.adapter } });
  if (exists) return apiError(`A ${parsed.data.adapter} connection for ${parsed.data.channel} already exists in this workspace.`, 409);

  const adapter = adapterFor(parsed.data.adapter);
  if (!adapter) return apiError("Unknown adapter.", 400);

  const cfg = { baseUrl: parsed.data.baseUrl, apiKey: parsed.data.apiKey, integrationIds: parsed.data.integrationIds };
  const check = await adapter.validateConnection(cfg);

  const connection = await prisma.channelConnection.create({
    data: {
      workspaceId: ctx.workspace.id,
      channel: parsed.data.channel,
      adapter: parsed.data.adapter,
      label: parsed.data.label || `Postiz for ${parsed.data.channel}`,
      configEncrypted: encryptSecret(JSON.stringify(cfg)),
      status: check.ok ? "verified" : "error",
      lastCheckedAt: new Date(),
      lastError: check.ok ? null : check.detail,
    },
  });

  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "connection",
    summary: check.ok
      ? `${parsed.data.adapter} connection for ${parsed.data.channel} added and verified.`
      : `${parsed.data.adapter} connection for ${parsed.data.channel} added, but verification failed: ${check.detail}`,
    meta: { connectionId: connection.id, ok: check.ok },
  });

  return json(
    {
      connection: { id: connection.id, channel: connection.channel, adapter: connection.adapter, status: connection.status, lastError: connection.lastError },
      check,
    },
    201
  );
}
