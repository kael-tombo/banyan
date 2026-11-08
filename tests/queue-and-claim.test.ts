import { describe, it, expect, afterEach } from "vitest";
import { claimDecision, EARLY_TOLERANCE_MS } from "@/lib/publishing/claim";
import {
  JOB,
  jobPayload,
  publicationJobOptions,
  enqueuePublicationAttempt,
  enqueue,
  queueConfigured,
  QueueUnavailableError,
} from "@/lib/queue/jobs";

const now = new Date("2026-11-01T10:00:00.000Z");
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

describe("claimDecision (US-006: a publication is delivered at most once)", () => {
  it("claims a scheduled publication that is due", () => {
    expect(claimDecision({ status: "scheduled", scheduledFor: at(-1_000), attempts: 0 }, now)).toEqual({ claimable: true });
  });

  it("tolerates a job firing a few seconds early", () => {
    expect(claimDecision({ status: "scheduled", scheduledFor: at(EARLY_TOLERANCE_MS - 1), attempts: 1 }, now).claimable).toBe(true);
  });

  it("refuses a scheduled publication that was moved to a later time", () => {
    const d = claimDecision({ status: "scheduled", scheduledFor: at(60 * 60_000), attempts: 0 }, now);
    expect(d.claimable).toBe(false);
  });

  it("claims a fresh immediate attempt once", () => {
    expect(claimDecision({ status: "attempting", scheduledFor: null, attempts: 0 }, now).claimable).toBe(true);
  });

  it("refuses an attempt that another worker already started", () => {
    expect(claimDecision({ status: "attempting", scheduledFor: null, attempts: 1 }, now).claimable).toBe(false);
  });

  it.each(["published", "cancelled", "blocked", "failed"])("never executes a %s publication (stale jobs are no-ops)", (status) => {
    expect(claimDecision({ status, scheduledFor: at(-1_000), attempts: 2 }, now).claimable).toBe(false);
  });
});

describe("publication job options (US-005)", () => {
  it("delays the job until the due time", () => {
    expect(publicationJobOptions("p1", at(90_000), now).delay).toBe(90_000);
  });

  it("never uses a negative delay for an overdue publication", () => {
    expect(publicationJobOptions("p1", at(-5_000), now).delay).toBe(0);
  });

  it("derives a deterministic job id so the same attempt is enqueued once", () => {
    const a = publicationJobOptions("p1", at(1_000), now);
    const b = publicationJobOptions("p1", at(1_000), at(500));
    expect(a.jobId).toBe(b.jobId);
    expect(a.jobId).not.toBe(publicationJobOptions("p1", at(2_000), now).jobId);
  });

  it("uses a job id BullMQ accepts (no colons), whatever the publication id contains", () => {
    expect(publicationJobOptions("cmx:1/2", at(0), now).jobId).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("keeps failed jobs as a dead-letter record", () => {
    expect(publicationJobOptions("p1", at(0), now).removeOnFail).toBeTruthy();
    expect(publicationJobOptions("p1", at(0), now).attempts).toBeGreaterThan(1);
  });
});

describe("job payload validation (US-005)", () => {
  it("accepts a well-formed publication payload", () => {
    expect(jobPayload[JOB.publicationAttempt].parse({ publicationId: "abc" })).toEqual({ publicationId: "abc" });
  });

  it("rejects an empty publication id", () => {
    expect(() => jobPayload[JOB.publicationAttempt].parse({ publicationId: "" })).toThrow();
  });

  it("rejects unexpected sweep fields", () => {
    expect(() => jobPayload[JOB.maintenanceSweep].parse({ surprise: true })).toThrow();
  });
});

describe("queue without Redis (plain local dev)", () => {
  const saved = process.env.REDIS_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = saved;
  });

  it("reports the queue as off and leaves the work to the sweep", async () => {
    delete process.env.REDIS_URL;
    expect(queueConfigured()).toBe(false);
    await expect(enqueuePublicationAttempt("p1", now)).resolves.toMatchObject({ queued: false });
  });

  it("fails loudly when enqueue is called directly without a queue", async () => {
    delete process.env.REDIS_URL;
    await expect(enqueue(JOB.publicationAttempt, { publicationId: "p1" })).rejects.toBeInstanceOf(QueueUnavailableError);
  });
});
