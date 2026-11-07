import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { log } from "@/lib/log";
import { renderEmail, type EmailTemplate, type TemplateData } from "./templates";
import { EmailSendError, getTransport, safeAddress } from "./transport";

/**
 * Transactional email outbox (US-010). Postgres is the source of truth, as
 * for every other job: `queueEmail` writes a row, the queue job (or, without
 * Redis, an immediate call) delivers it, and the maintenance sweep retries
 * whatever is due. The template data can hold a single-use link, so it is
 * stored encrypted and erased once the message is sent or gives up.
 */

export const MAX_EMAIL_ATTEMPTS = 5;
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const STUCK_SENDING_MS = 10 * 60_000;

export function nextAttemptDelay(attempts: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1)];
}

export class InvalidRecipientError extends Error {
  constructor() {
    super("That email address cannot receive mail.");
    this.name = "InvalidRecipientError";
  }
}

export async function queueEmail<T extends EmailTemplate>(input: {
  template: T;
  to: string;
  data: TemplateData[T];
  userId?: string | null;
  /**
   * Without a queue, deliver after returning instead of waiting on SMTP. Used
   * where response time must not depend on whether an email was sent (password
   * reset), since that would reveal which addresses have accounts.
   */
  background?: boolean;
  /** Queue at most one message per key (scheduled mail, e.g. one weekly summary per workspace, user and week). */
  dedupeKey?: string;
}): Promise<{ id: string; queued: boolean; duplicate?: boolean }> {
  const to = safeAddress(input.to);
  if (!to) throw new InvalidRecipientError();
  renderEmail(input.template, input.data); // fail now, not in the worker, if the data is incomplete
  if (input.dedupeKey) {
    const existing = await prisma.emailMessage.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
    if (existing) return { id: existing.id, queued: false, duplicate: true };
  }
  let row: { id: string };
  try {
    row = await prisma.emailMessage.create({
      data: { template: input.template, toAddress: to, userId: input.userId ?? null, payload: encryptSecret(JSON.stringify(input.data)), dedupeKey: input.dedupeKey ?? null },
      select: { id: true },
    });
  } catch (err) {
    // Two sweeps raced on the same key: the other one queued it.
    if (input.dedupeKey && (err as { code?: string }).code === "P2002") {
      const existing = await prisma.emailMessage.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
      if (existing) return { id: existing.id, queued: false, duplicate: true };
    }
    throw err;
  }

  const { queueConfigured, enqueue, JOB } = await import("@/lib/queue/jobs");
  if (queueConfigured()) {
    try {
      await enqueue(JOB.emailSend, { messageId: row.id }, { jobId: `email-${row.id}`, removeOnComplete: { age: 24 * 3600 }, removeOnFail: { age: 7 * 24 * 3600 } });
      return { id: row.id, queued: true };
    } catch (err) {
      log("warn", "email.enqueue_failed", { messageId: row.id, error: (err as Error).message });
    }
  }
  // No queue (plain dev) or the queue is down: deliver now; the sweep retries failures.
  const delivery = deliverEmail(row.id).catch((err) => log("error", "email.deliver_error", { messageId: row.id, error: (err as Error).message }));
  if (input.background) {
    // Kept alive past the response on serverless hosts, where an unawaited send could be cut off.
    const { finishAfterResponse } = await import("@/lib/runtime/after-response");
    finishAfterResponse(delivery);
  } else await delivery;
  return { id: row.id, queued: false };
}

export type DeliveryResult = { status: "sent" | "dev_logged" | "retry" | "failed" | "skipped"; error?: string };

/** Deliver one message if it is due. Safe to call twice: the claim makes the second call a no-op. */
export async function deliverEmail(messageId: string, now: Date = new Date()): Promise<DeliveryResult> {
  const claimed = await prisma.emailMessage.updateMany({
    where: { id: messageId, status: "queued", nextAttemptAt: { lte: now } },
    data: { status: "sending", attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return { status: "skipped" };

  const msg = await prisma.emailMessage.findUniqueOrThrow({ where: { id: messageId } });
  const transport = getTransport();
  try {
    if (!msg.payload) throw new EmailSendError("The message content is gone.", false);
    const data = JSON.parse(decryptSecret(msg.payload)) as TemplateData[EmailTemplate];
    const rendered = renderEmail(msg.template as EmailTemplate, data);
    const res = await transport.send({ ...rendered, to: msg.toAddress });
    const status = res.delivered ? "sent" : "dev_logged";
    await prisma.emailMessage.update({
      where: { id: msg.id },
      data: { status, transport: res.transport, providerId: res.providerId, sentAt: new Date(), payload: null, lastError: null },
    });
    log("info", "email.sent", { messageId: msg.id, template: msg.template, transport: res.transport, delivered: res.delivered });
    return { status };
  } catch (err) {
    const retryable = err instanceof EmailSendError ? err.retryable : true;
    const error = (err as Error).message.slice(0, 300);
    const giveUp = !retryable || msg.attempts >= MAX_EMAIL_ATTEMPTS;
    await prisma.emailMessage.update({
      where: { id: msg.id },
      data: giveUp
        ? { status: "failed", transport: transport.name, lastError: error, payload: null }
        : { status: "queued", transport: transport.name, lastError: error, nextAttemptAt: new Date(now.getTime() + nextAttemptDelay(msg.attempts)) },
    });
    log(giveUp ? "error" : "warn", giveUp ? "email.failed" : "email.retry", { messageId: msg.id, template: msg.template, attempts: msg.attempts, error });
    return { status: giveUp ? "failed" : "retry", error };
  }
}

/** Maintenance sweep: release sends a crashed worker left behind, then deliver what is due. */
export async function deliverDueEmails(limit = 20, now: Date = new Date()): Promise<{ attempted: number; sent: number }> {
  await prisma.emailMessage.updateMany({
    where: { status: "sending", updatedAt: { lt: new Date(now.getTime() - STUCK_SENDING_MS) } },
    data: { status: "queued" },
  });
  const due = await prisma.emailMessage.findMany({
    where: { status: "queued", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let sent = 0;
  for (const m of due) {
    const r = await deliverEmail(m.id, now);
    if (r.status === "sent" || r.status === "dev_logged") sent++;
  }
  return { attempted: due.length, sent };
}
