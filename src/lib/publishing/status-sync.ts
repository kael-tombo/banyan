import { prisma } from "@/lib/db";
import { providerFor, credentialsFromConnection } from "@/lib/distribution/providers";
import type { DistributionProvider, ProviderContext, Result } from "@/lib/distribution/types";
import type { PublishResult } from "@/lib/publishing/types";
import { recordActivity } from "@/lib/activity";

/**
 * Publication status sync (BOS-027, contract C7) and provider-side cancel (BOS-029, C8).
 *
 * When SocialFlow accepts a post but has not confirmed it yet ("queued"),
 * Banyan keeps the SocialFlow post id and asks for its status on the next
 * attempt, instead of sending the post again. A publication becomes
 * "published" only when SocialFlow answers "published". The sweep also fills
 * in live URLs for confirmed posts that arrived without one.
 */

type StatusAnswer = Result<{ state: string; url?: string }>;

/**
 * Turn a status read (C7) into the same outcome shape a publish returns, so
 * executePublication's success, retry and failure paths apply unchanged.
 * `null` means "the status could not tell us anything: send the post again
 * with its idempotency key", which SocialFlow answers with the same post.
 */
export function outcomeFromStatus(answer: StatusAnswer, externalId: string): PublishResult | null {
  if (!answer.ok) {
    if (answer.error.retryable) return { ok: false, retryable: true, error: answer.error.message, externalId, raw: { statusCheck: answer.error } };
    return null; // e.g. not_found: replaying the idempotent publish is the safe way to find out
  }
  const { state, url } = answer.value;
  const raw = { statusCheck: answer.value };
  switch (state) {
    case "published":
      return { ok: true, externalId, externalUrl: url, raw };
    case "failed":
      return { ok: false, retryable: false, error: "SocialFlow.ai reports that the post failed to publish.", externalId, raw };
    case "cancelled":
      return { ok: false, retryable: false, error: "The post was cancelled in SocialFlow.ai; nothing was published.", externalId, raw };
    default: // queued, scheduled: accepted, not confirmed yet
      return { ok: false, retryable: true, error: `SocialFlow.ai has the post (${state}) but has not confirmed publication yet.`, externalId, raw };
  }
}

/** Ask the provider about a post it already accepted; null = fall back to an idempotent publish. */
export async function syncAcceptedPost(provider: DistributionProvider, ctx: ProviderContext, externalId: string): Promise<PublishResult | null> {
  return outcomeFromStatus(await provider.getStatus(ctx, externalId), externalId);
}

/** How far back the URL backfill looks. */
export const URL_BACKFILL_WINDOW_MS = 7 * 24 * 3600_000;

/**
 * Confirmed publications that came back without a live URL: ask the provider
 * again (bounded, recent only). Never changes a status; only fills the URL the
 * provider itself reports.
 */
export async function backfillPublishedUrls(now = new Date(), limit = 20): Promise<{ checked: number; filled: number }> {
  const rows = await prisma.publication.findMany({
    where: {
      status: "published",
      manual: false,
      externalId: { not: null },
      externalUrl: null,
      publishedAt: { gte: new Date(now.getTime() - URL_BACKFILL_WINDOW_MS) },
      connection: { status: { notIn: ["error", "removed"] } },
    },
    include: { connection: true, contentItem: { select: { workspaceId: true } } },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  let filled = 0;
  for (const p of rows) {
    const provider = p.connection ? providerFor(p.connection.adapter) : null;
    if (!provider || !p.connection || !p.externalId) continue;
    const st = await provider.getStatus({ workspaceId: p.contentItem.workspaceId, credentials: credentialsFromConnection(p.connection) }, p.externalId);
    if (st.ok && st.value.state === "published" && st.value.url && isHttpUrl(st.value.url)) {
      await prisma.publication.update({ where: { id: p.id }, data: { externalUrl: st.value.url } });
      filled++;
    }
  }
  return { checked: rows.length, filled };
}

function isHttpUrl(u: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(u).protocol);
  } catch {
    return false;
  }
}

export type CancelOutcome = { ok: true; atProvider: boolean } | { ok: false; message: string; status: number };

/**
 * Cancel a content item's pending publication (BOS-029).
 *
 * A publication Banyan has not sent yet is cancelled locally. One SocialFlow
 * already holds (it has an externalId) is cancelled there first; if SocialFlow
 * refuses (already published, or publishing right now), nothing changes in
 * Banyan and the editor is told why. Banyan never claims a cancel it could not make.
 */
export async function cancelPendingPublication(contentItemId: string, workspaceId: string, actorUserId?: string): Promise<CancelOutcome> {
  const pending = await prisma.publication.findMany({
    where: { contentItemId, status: "scheduled", contentItem: { workspaceId } },
    include: { connection: true },
  });
  let atProvider = false;
  for (const p of pending) {
    if (!p.externalId) continue;
    const provider = p.connection ? providerFor(p.connection.adapter) : null;
    if (!provider || !p.connection) {
      return { ok: false, status: 409, message: "SocialFlow.ai already has this post and is not reachable from this product right now, so it cannot be cancelled from Banyan. Cancel it in SocialFlow.ai." };
    }
    const res = await provider.cancelScheduled({ workspaceId, credentials: credentialsFromConnection(p.connection) }, p.externalId);
    if (!res.ok) return { ok: false, status: res.error.retryable ? 502 : 409, message: `SocialFlow.ai did not cancel it: ${res.error.message}` };
    atProvider = true;
  }
  if (pending.length) {
    await prisma.publication.updateMany({
      where: { id: { in: pending.map((p) => p.id) }, status: "scheduled" },
      data: { status: "blocked", lastError: atProvider ? "Schedule cancelled by user (also cancelled in SocialFlow.ai)." : "Schedule cancelled by user." },
    });
    await recordActivity({
      workspaceId,
      type: "publication_cancelled",
      actorType: actorUserId ? "user" : "system",
      summary: atProvider ? "Scheduled post cancelled, in Banyan and in SocialFlow.ai." : "Scheduled post cancelled before it was sent.",
      meta: { contentItemId },
    });
  }
  return { ok: true, atProvider };
}

export type PriorAttemptVerdict =
  | { proceed: true }
  | { proceed: false; reason: string; adoptPublished?: { publicationId: string; url?: string } };

/**
 * Before a new attempt after a failure: an earlier attempt SocialFlow accepted
 * (it has an externalId) may still go out, and a fresh attempt is a new post,
 * so it would publish twice. Ask SocialFlow first: proceed only when the
 * earlier post is definitely not going out (failed or cancelled there). If it
 * went out after all, adopt it instead of posting again.
 */
export async function checkPriorAttempts(
  workspaceId: string,
  publications: { id: string; status: string; externalId: string | null; connectionId: string | null }[],
): Promise<PriorAttemptVerdict> {
  for (const p of publications) {
    if (p.status !== "failed" || !p.externalId || !p.connectionId) continue;
    const connection = await prisma.channelConnection.findFirst({ where: { id: p.connectionId, workspaceId } });
    const provider = connection && !["error", "removed"].includes(connection.status) ? providerFor(connection.adapter) : null;
    if (!provider || !connection) continue; // nothing can publish through it; a new attempt is blocked or exported anyway
    const st = await provider.getStatus({ workspaceId, credentials: credentialsFromConnection(connection) }, p.externalId);
    if (!st.ok) {
      if (st.error.code === "not_found") continue;
      return { proceed: false, reason: `SocialFlow.ai could not say whether the earlier attempt went out (${st.error.message}). Try again shortly, so this post is not published twice.` };
    }
    if (st.value.state === "failed" || st.value.state === "cancelled") continue;
    if (st.value.state === "published") {
      return { proceed: false, reason: "The earlier attempt was published after all; it is now recorded as published.", adoptPublished: { publicationId: p.id, url: st.value.url } };
    }
    return { proceed: false, reason: `SocialFlow.ai still has the earlier attempt (${st.value.state}). Cancel it there, or wait for it, so this post is not published twice.` };
  }
  return { proceed: true };
}
