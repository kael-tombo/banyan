import { prisma } from "@/lib/db";
import { isExportableContent } from "@/lib/state-machines";
import { providerFor, credentialsFromConnection, EXPORT_MODE_MESSAGE } from "@/lib/distribution/providers";
import { shouldRetryPublication, nextRetryDelayMs } from "@/lib/publishing/retry";
import { recordActivity } from "@/lib/activity";
import { randomSlug } from "@/lib/crypto";
import { claimDecision } from "@/lib/publishing/claim";
import { enqueuePublicationAttempt } from "@/lib/queue/jobs";

/** Connection statuses that can never be used to publish. */
export const UNUSABLE_CONNECTION_STATUSES = ["error", "removed"];

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
    : await prisma.channelConnection.findFirst({ where: { workspaceId: input.workspaceId, channel: item.channel, status: { notIn: UNUSABLE_CONNECTION_STATUSES } } });

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
    await enqueuePublicationAttempt(publication.id, input.scheduledFor);
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
  if (!publication) {
    return { ok: false, status: "skipped", message: "Publication already finalized or missing." };
  }
  // Only a scheduled publication that is due, or one created for an immediate
  // attempt, may be executed. A queued job for a publication that was since
  // cancelled, published, or rescheduled later is a no-op.
  const decision = claimDecision(publication);
  if (!decision.claimable) {
    return { ok: false, status: "skipped", message: decision.reason };
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

  // Atomic claim: the conditional update succeeds for exactly one caller, so a
  // queue job and the safety sweep can never both deliver the same post.
  const claimed = await prisma.publication.updateMany({
    where: { id: publication.id, status: publication.status, attempts: publication.attempts },
    data: { attempts: { increment: 1 }, status: "attempting" },
  });
  if (claimed.count === 0) {
    return { ok: false, status: "skipped", message: "Another worker is already attempting this publication." };
  }
  await recordActivity({ workspaceId: item.workspaceId, type: "publication_attempt", actorType: "system", summary: `Publishing attempt for "${item.title}" via ${publication.provider}.` });

  const provider = publication.connection && !UNUSABLE_CONNECTION_STATUSES.includes(publication.connection.status)
    ? providerFor(publication.connection.adapter)
    : null;
  if (!publication.connection || !provider) {
    const message = EXPORT_MODE_MESSAGE;
    await prisma.publication.update({
      where: { id: publication.id },
      data: { status: "blocked", lastError: message },
    });
    await prisma.contentItem.update({ where: { id: item.id }, data: { status: "approved", scheduledFor: null } });
    await recordActivity({ workspaceId: item.workspaceId, type: "publication_blocked", actorType: "system", summary: message, meta: { contentItemId: item.id } });
    return { ok: false, status: "blocked", message };
  }

  const result = await provider.publish({
    ctx: { workspaceId: item.workspaceId, credentials: credentialsFromConnection(publication.connection) },
    channel: item.channel,
    text: item.body,
    title: item.title,
    idempotencyKey: publication.idempotencyKey,
    scheduledFor: publication.scheduledFor,
  });

  if (!result.ok) {
    const attemptNumber = publication.attempts; // incremented before the adapter call
    const errorMessage = result.error ?? "Provider returned an error.";

    // Bounded retry: transient failures (rate limit, outage, timeout) are
    // rescheduled with exponential backoff; permanent failures stay terminal.
    // The retried attempt re-enters executePublication, so approval is
    // re-verified and the duplicate-publication guard still applies.
    if (shouldRetryPublication(attemptNumber, result)) {
      const retryAt = new Date(Date.now() + nextRetryDelayMs(attemptNumber, { retryAfterMs: result.retryAfterMs }));
      await prisma.publication.update({
        where: { id: publication.id },
        data: { status: "scheduled", scheduledFor: retryAt, lastError: errorMessage },
      });
      await prisma.contentItem.update({ where: { id: item.id }, data: { status: "scheduled", scheduledFor: retryAt } });
      await enqueuePublicationAttempt(publication.id, retryAt);
      await recordActivity({
        workspaceId: item.workspaceId,
        type: "publication_retry_scheduled",
        actorType: "system",
        summary: `Attempt ${attemptNumber} failed transiently ("${errorMessage.slice(0, 140)}"); retry #${attemptNumber + 1} in ~${Math.round((retryAt.getTime() - Date.now()) / 60_000)} min.`,
        meta: { contentItemId: item.id, publicationId: publication.id, attemptNumber },
      });
      return { ok: false, status: "retry_scheduled", message: `Transient failure — attempt ${attemptNumber + 1} scheduled for ${retryAt.toISOString()}.` };
    }

    await prisma.publication.update({
      where: { id: publication.id },
      data: { status: "failed", lastError: errorMessage, providerResponse: JSON.stringify(result.raw).slice(0, 4000) },
    });
    await prisma.contentItem.update({ where: { id: item.id }, data: { status: "failed" } });
    await recordActivity({ workspaceId: item.workspaceId, type: "publication_failed", actorType: "system", summary: `Publishing failed for "${item.title}" after ${attemptNumber} attempt(s): ${errorMessage}`, meta: { contentItemId: item.id } });
    return { ok: false, status: "failed", message: errorMessage };
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
  const existing = item.publications.find((p) => p.status === "published");

  let validated: URL;
  try {
    validated = new URL(input.url);
    if (!["http:", "https:"].includes(validated.protocol)) throw new Error("bad protocol");
  } catch {
    return { ok: false, message: "Provide the live post URL (https://...)." };
  }

  // Idempotent (US-034): recording the same live URL again is a no-op success;
  // a different URL for already-published content is refused.
  if (existing) {
    return existing.externalUrl === validated.toString()
      ? { ok: true, message: "Manual publication already recorded." }
      : { ok: false, message: "This content is already published." };
  }
  if (!isExportableContent(item)) return { ok: false, message: "Content must be approved before a manual publication can be recorded." };

  try {
    await prisma.publication.create({
      data: {
        contentItemId: item.id,
        provider: "manual",
        status: "published",
        externalUrl: validated.toString(),
        providerResponse: JSON.stringify({ recordedManually: true, url: validated.toString() }),
        publishedAt: new Date(),
        manual: true,
        // One manual publication per item: the unique key makes a concurrent
        // second recording fail in the database instead of creating a duplicate.
        idempotencyKey: `${item.id}:manual`,
      },
    });
  } catch (err) {
    // A concurrent recording won the unique idempotency key: same outcome.
    if ((err as { code?: string }).code === "P2002") return { ok: true, message: "Manual publication already recorded." };
    throw err;
  }
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
