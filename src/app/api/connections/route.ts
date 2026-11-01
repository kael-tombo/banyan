import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { encryptSecret } from "@/lib/crypto";
import { providerFor, enabledProviderIds, EXPORT_MODE_MESSAGE } from "@/lib/distribution/providers";
import { recordActivity } from "@/lib/activity";
import { NextRequest } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  channel: z.enum(["x", "linkedin"]),
  // A provider id from the distribution registry; only enabled providers are accepted.
  adapter: z.string().trim().min(1).max(40),
  label: z.string().trim().max(120).default(""),
  // Provider-specific credentials, stored encrypted and never returned.
  credentials: z.record(z.string(), z.string().max(400)).default({}),
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
  const parsed = await readJson(req, createSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const provider = providerFor(parsed.data.adapter);
  if (!provider) {
    const available = enabledProviderIds();
    return apiError(
      available.length
        ? `Unknown or unavailable provider "${parsed.data.adapter}". Available: ${available.join(", ")}.`
        : `No distribution provider is available on this deployment. ${EXPORT_MODE_MESSAGE}`,
      400
    );
  }

  const exists = await prisma.channelConnection.findFirst({ where: { workspaceId: ctx.workspace.id, channel: parsed.data.channel, adapter: provider.id, status: { not: "removed" } } });
  if (exists) return apiError(`A ${provider.label} connection for ${parsed.data.channel} already exists in this workspace.`, 409);

  const cfg = parsed.data.credentials;
  const check = await provider.validateCredentials({ workspaceId: ctx.workspace.id, credentials: cfg });

  const connection = await prisma.channelConnection.create({
    data: {
      workspaceId: ctx.workspace.id,
      channel: parsed.data.channel,
      adapter: provider.id,
      label: parsed.data.label || `${provider.label} for ${parsed.data.channel}`,
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
