import { z } from "zod";
import type { Queue, JobsOptions } from "bullmq";

/**
 * Banyan's background job queue (BullMQ on Redis) — ADR-002.
 *
 * Postgres stays the source of truth. A job only says "look at this record";
 * the handler re-reads the record and its idempotency guards decide what
 * happens. So a lost job is caught by the maintenance sweep, and a duplicated
 * job is a no-op.
 *
 * When REDIS_URL is not configured (plain `npm run dev` without Docker) the
 * queue is off: enqueue helpers report `queued: false` and the sweep — run by
 * the worker's HTTP tick fallback — does the work, as it did before Redis.
 */

export const QUEUE_NAME = "banyan";

export const JOB = {
  publicationAttempt: "publication.attempt",
  maintenanceSweep: "maintenance.sweep",
  productAnalyze: "product.analyze",
  autopilotStrategy: "autopilot.strategy",
  autopilotDrafts: "autopilot.drafts",
} as const;
export type JobName = (typeof JOB)[keyof typeof JOB];

export const jobPayload = {
  [JOB.publicationAttempt]: z.object({ publicationId: z.string().min(1) }),
  [JOB.maintenanceSweep]: z.object({}).strict(),
  [JOB.productAnalyze]: z.object({ analysisId: z.string().min(1) }),
  [JOB.autopilotStrategy]: z.object({ workspaceId: z.string().min(1) }),
  [JOB.autopilotDrafts]: z.object({ workspaceId: z.string().min(1), strategyId: z.string().min(1) }),
} satisfies Record<JobName, z.ZodTypeAny>;

export type JobPayload<N extends JobName> = z.infer<(typeof jobPayload)[N]>;

/** Raised when the queue is configured but cannot accept work. */
export class QueueUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Job queue unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "QueueUnavailableError";
  }
}

export function queueConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/**
 * Deterministic options for a publication attempt. The job id is unique per
 * publication and due time, so scheduling the same attempt twice enqueues one
 * job. BullMQ forbids ":" in custom ids.
 */
export function publicationJobOptions(publicationId: string, runAt: Date, now: Date = new Date()): JobsOptions {
  return {
    jobId: `publication-${publicationId.replace(/[^A-Za-z0-9_-]/g, "_")}-${runAt.getTime()}`,
    delay: Math.max(0, runAt.getTime() - now.getTime()),
    // Provider retries are decided by the publishing workflow (retry.ts) and
    // re-enqueued as new jobs. BullMQ attempts here only cover infrastructure
    // failures such as a database blip while the job runs.
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 7 * 24 * 3600, count: 5_000 },
    removeOnFail: { age: 30 * 24 * 3600 }, // failed jobs are the dead-letter set
  };
}

let queuePromise: Promise<Queue> | null = null;

/** Lazily connect, so importing this module never opens a Redis connection. */
export async function getQueue(): Promise<Queue> {
  if (!queueConfigured()) throw new QueueUnavailableError("REDIS_URL is not configured");
  if (!queuePromise) {
    queuePromise = (async () => {
      const { Queue } = await import("bullmq");
      const { redisConnectionOptions } = await import("@/lib/queue/redis");
      return new Queue(QUEUE_NAME, { connection: redisConnectionOptions() });
    })();
  }
  return queuePromise;
}

/** Validate and enqueue. Throws QueueUnavailableError if Redis cannot take the job. */
export async function enqueue<N extends JobName>(name: N, payload: JobPayload<N>, opts: JobsOptions = {}): Promise<string> {
  const data = jobPayload[name].parse(payload);
  try {
    const queue = await getQueue();
    const job = await queue.add(name, data, opts);
    return job.id ?? "";
  } catch (err) {
    if (err instanceof z.ZodError) throw err;
    throw new QueueUnavailableError(err);
  }
}

/**
 * Best-effort: enqueue a publication attempt for its due time. The publication
 * row is already durable in Postgres, so if the queue is off or down the
 * maintenance sweep still attempts it when due; we only lose the fast path.
 */
export async function enqueuePublicationAttempt(
  publicationId: string,
  runAt: Date,
): Promise<{ queued: boolean; reason?: string }> {
  if (!queueConfigured()) return { queued: false, reason: "queue not configured; the maintenance sweep will attempt it" };
  try {
    await enqueue(JOB.publicationAttempt, { publicationId }, publicationJobOptions(publicationId, runAt));
    return { queued: true };
  } catch (err) {
    console.warn(`[queue] could not enqueue publication ${publicationId}; the sweep will attempt it: ${(err as Error).message}`);
    return { queued: false, reason: (err as Error).message };
  }
}
