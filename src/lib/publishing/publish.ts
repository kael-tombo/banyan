import { prisma } from "@/lib/db";
import { isExportableContent } from "@/lib/state-machines";
import { decryptSecret } from "@/lib/crypto";
import { ConnectionConfig, PublishingAdapter } from "@/lib/publishing/types";
import { postizAdapter } from "@/lib/publishing/postiz";
import { recordActivity } from "@/lib/activity";
import { randomSlug } from "@/lib/crypto";

export const adapters: Record<string, PublishingAdapter> = {
  postiz: postizAdapter,
};

export function adapterFor(provider: string): PublishingAdapter | null {
  return adapters[provider] ?? null;
}

export function configFromConnection(connection: { configEncrypted: string }): ConnectionConfig {
  const parsed = JSON.parse(decryptSecret(connection.configEncrypted) || "{}") as Partial<ConnectionConfig>;
  return {
    baseUrl: parsed.baseUrl ?? "",
    apiKey: parsed.apiKey ?? "",
    integrationIds: parsed.integrationIds ?? {},
  };
}

/**
 * Publish or schedule approved content.
 *
 * Guarantees (enforced here, in the server — not the UI):
 *  - content must be approved (status approved/scheduled with approvedById);
 *  - duplicate publication is prevented via an active-publication check;
 *  - without a genuinely configured connection the attempt is recorded as
 *    "blocked" with actionable messaging — the rest of the workflow stays usable;
 *  - published status is only ever set after real provider confirmation
 *    (or an explicit manual action with a submitted live URL).
 */
export async function attemptPublication(input: {
  contentItemId: string;
  workspaceId: string;
  connectionId: string | null;
  scheduledFor?: Date | null;
  mode: "now" | "schedule";
}): Promise<{ ok: boolean; status: string; message: string; publicationId?: string }> {
  const item = await prisma.contentItem.findUnique({
    where: { id: input.contentItemId },
    include: { publications: true },
  });

  if (!item || item.workspaceId !== input.workspaceId) {
    return { ok: false, status: "blocked", message: "Content not found." };
  }
  if (!isExportableContent(item)) {
    return { ok: false, status: "blocked", message: "Content must be approved before publishing." };
  }

  // Duplicate execution guard: one active publication per content item.
  const active = item.publications.find((p) => ["scheduled", "attempting", "published"].includes(p.status));
  if (active) {
    if (active.status === "published") {
      return { ok: false, status: "published", message: "This content is already published." };
    }
    return { ok: false, status: active.status, message: `A publication is already ${active.status} for this content.`, publicationId: active.id };
  }

  const connection = input.connectionId
    ? await prisma.channelConnection.findFirst({ where: { id: input.connectionId, workspaceId: input.workspaceId } })
    : await prisma.channelConnection.findFirst({ where: { workspaceId: input.workspaceId, channel: item.channel, status: { not: "error" } } });

  const idempotencyKey = `${item.id}:${input.mode}:${input.scheduledFor ? Math.floor(input.scheduledFor.getTime() / 60_000) * 60_000 : "now"}`;
  const publication = await prisma.publication.create({
    data: {
      contentItemId: item.id,
      connectionId: connection?.id ?? null,
      provider: connection ? connection.adapter : "unconfigured",
      status: input.mode === "schedule" && input.scheduledFor ? "scheduled" : "attempting",
      scheduledFor: input.scheduledFor ?? null,
      attempts: 0,
      idempotencyKey,
    },
  });

  if (input.mode === "schedule" && input.scheduledFor) {
    await prisma.contentItem.update({ where: { id: item.id }, data: { status: "scheduled", scheduledFor: input.scheduledFor } });
    await recordActivity({
      workspaceId: input.workspaceId,
      type: "publication_attempt",
      summary: `Content scheduled for ${input.scheduledFor.toISOString()} (pending publishing worker).`,
      meta: { contentItemId: item.id, publicationId: publication.id },
    });
    return { ok: true, status: "scheduled", message: "Scheduled. The publishing worker will attempt delivery at the scheduled time.", publicationId: publication.id };
  }

  // Immediate: execute now.
  await prisma.contentItem.update({ where: { id: item.id }, data: { status: "publishing" } });
  const result = await executePublication(publication.id);
  return { ok: result.ok, status: result.status, message: result.message, publicationId: publication.id };
}

export async function executePublication(publicationId: string): Promise<{ ok: boolean; status: string; message: string }> {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: { contentItem: true, connection: true },
  });
  if (!publication || publication.status === "published") {
    return { ok: false, status: "skipped", message: "Publication already finalized or missing." };
  }

  const item = publication.contentItem;
  if (!isExportableContent(item)) {
    await prisma.publication.update({
      where: { id: publication.id },
      data: { status: "blocked", lastError: "Content lost approval before the attempt; publishing refused." },
    });
    await prisma.contentItem.update({ where: { id: item.id }, data: { status: "failed" } }).catch(() => {});
    return { ok: false, status: "blocked", message: "Content lost approval before the attempt; publishing refused." };
  }

  await prisma.publication.update({ where: { id: publication.id }, data: { attempts: { increment: 1 }, status: "attempting" } });
  await recordActivity({ workspaceId: item.workspaceId, type: "publication_attempt", actorType: "system", summary: `Publishing attempt for "${item.title}" via ${publication.provider}.` });

  if (!publication.connection) {
    const message =
      "No configured publishing connection for this channel. Configure a Postiz connection in Publishing, or record a manual publication with the live post URL once you have published it yourself.";
    await prisma.publication.update({
      where: { id: publication.id },
      data: { status: "blocked", lastError: message },
    });
    await prisma.contentItem.update({ where: { id: item.id }, data: { status: "approved", scheduledFor: null } });
    await recordActivity({ workspaceId: item.workspaceId, type: "publication_blocked", actorType: "system", summary: message, meta: { contentItemId: item.id } });
    return { ok: false, status: "blocked", message };
  }

  const adapter = adapterFor(publication.connection.adapter);
  if (!adapter) {
    await prisma.publication.update({ where: { id: publication.id }, data: { status: "failed", lastError: `Unknown adapter "${publication.connection.adapter}".` } });
    await prisma.contentItem.update({ where: { id: item.id }, data: { status: "failed" } });
    return { ok: false, status: "failed", message: `Unknown adapter "${publication.connection.adapter}".` };
  }

  const cfg = configFromConnection(publication.connection);
  const result = await adapter.publish({
    cfg,
    channel: item.channel,
    text: item.body,
    title: item.title,
    scheduledFor: publication.scheduledFor,
  });

  if (!result.ok) {
    await prisma.publication.update({
      where: { id: publication.id },
      data: { status: "failed", lastError: result.error ?? "Provider returned an error.", providerResponse: JSON.stringify(result.raw).slice(0, 4000) },
    });
    await prisma.contentItem.update({ where: { id: item.id }, data: { status: "failed" } });
    await recordActivity({ workspaceId: item.workspaceId, type: "publication_failed", actorType: "system", summary: `Publishing failed for "${item.title}": ${result.error ?? "unknown error"}`, meta: { contentItemId: item.id } });
    return { ok: false, status: "failed", message: result.error ?? "Provider returned an error." };
  }

  // Provider confirmed. Only now does content become published.
  await prisma.publication.update({
    where: { id: publication.id },
    data: {
      status: "published",
      externalId: result.externalId ?? null,
      providerResponse: JSON.stringify(result.raw).slice(0, 8000),
      publishedAt: new Date(),
    },
  });
  await prisma.contentItem.update({
    where: { id: item.id },
    data: { status: "published", publishedAt: new Date(), scheduledFor: null },
  });
  await recordActivity({
    workspaceId: item.workspaceId,
    type: "publication_success",
    actorType: "system",
    summary: `Published "${item.title}" via ${publication.connection.adapter}${result.externalId ? ` (provider id ${result.externalId})` : ""}.`,
    meta: { contentItemId: item.id, externalId: result.externalId },
  });
  return { ok: true, status: "published", message: "Published and confirmed by the provider." };
}

/**
 * Manual publication confirmation: the user records an actual live URL that
 * they published themselves. This is a genuine confirmation from a human,
 * recorded distinctly (manual=true) — never fabricated automatically.
 */
export async function recordManualPublication(input: { contentItemId: string; workspaceId: string; url: string }): Promise<{ ok: boolean; message: string }> {
  const item = await prisma.contentItem.findUnique({ where: { id: input.contentItemId }, include: { publications: true } });
  if (!item || item.workspaceId !== input.workspaceId) return { ok: false, message: "Content not found." };
  if (!isExportableContent(item)) return { ok: false, message: "Content must be approved before a manual publication can be recorded." };
  const existing = item.publications.find((p) => p.status === "published");
  if (existing) return { ok: false, message: "This content is already published." };

  let validated: URL;
  try {
    validated = new URL(input.url);
    if (!["http:", "https:"].includes(validated.protocol)) throw new Error("bad protocol");
  } catch {
    return { ok: false, message: "Provide the live post URL (https://...)." };
  }

  await prisma.publication.create({
    data: {
      contentItemId: item.id,
      provider: "manual",
      status: "published",
      externalUrl: validated.toString(),
      providerResponse: JSON.stringify({ recordedManually: true, url: validated.toString() }),
      publishedAt: new Date(),
      manual: true,
      idempotencyKey: `${item.id}:manual:${Date.now()}`,
    },
  });
  await prisma.contentItem.update({ where: { id: item.id }, data: { status: "published", publishedAt: new Date() } });
  await recordActivity({ workspaceId: input.workspaceId, type: "publication_success", summary: `Manual publication recorded for "${item.title}" at ${validated.host} (user-confirmed).`, meta: { contentItemId: item.id, manual: true } });
  return { ok: true, message: "Manual publication recorded." };
}

/** Worker entry point: attempt every due scheduled publication. */
export async function processDueSchedule(now = new Date()): Promise<{ attempted: number; published: number; failed: number }> {
  const due = await prisma.publication.findMany({
    where: { status: "scheduled", scheduledFor: { lte: now } },
    include: { contentItem: true },
    take: 20,
    orderBy: { scheduledFor: "asc" },
  });
  let published = 0;
  let failed = 0;
  for (const p of due) {
    const res = await executePublication(p.id);
    if (res.ok) published++;
    else failed++;
  }
  return { attempted: due.length, published, failed };
}
