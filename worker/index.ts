import "dotenv/config";

/**
 * Banyan worker — `npm run worker` (dev) or `node dist/worker.js` (Docker).
 *
 * With REDIS_URL (Docker Compose): consumes the BullMQ queue.
 *   - publication.attempt  → executePublication (atomic claim, approval re-check, bounded retry)
 *   - maintenance.sweep    → due publications + agent workflow advancement, every WORKER_INTERVAL_MS
 *   - product.analyze      → read and analyse a product website (US-021)
 *
 * Without REDIS_URL (plain local dev): falls back to POSTing the protected
 * /api/worker/tick endpoint on an interval, exactly as before Redis existed.
 *
 * Either way the rules live server-side in src/lib, so the worker cannot drift
 * from the app's behaviour, and duplicate execution is prevented in Postgres.
 */

const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 60_000);

async function runQueueWorker(): Promise<void> {
  const { Worker } = await import("bullmq");
  const { redisConnectionOptions } = await import("@/lib/queue/redis");
  const { QUEUE_NAME, JOB, jobPayload, getQueue } = await import("@/lib/queue/jobs");
  const { executePublication } = await import("@/lib/publishing/publish");
  const { runMaintenanceSweep } = await import("@/lib/maintenance");

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case JOB.publicationAttempt: {
          const { publicationId } = jobPayload[JOB.publicationAttempt].parse(job.data);
          return executePublication(publicationId);
        }
        case JOB.maintenanceSweep:
          return runMaintenanceSweep();
        case JOB.productAnalyze: {
          const { analysisId } = jobPayload[JOB.productAnalyze].parse(job.data);
          const { runAnalysis } = await import("@/lib/product/analysis-runner");
          return runAnalysis(analysisId);
        }
        case JOB.autopilotStrategy: {
          const { workspaceId, goalId } = jobPayload[JOB.autopilotStrategy].parse(job.data);
          const { runAutopilotStrategy, runCycleStrategy } = await import("@/lib/agents/autopilot");
          return goalId ? runCycleStrategy(workspaceId, goalId) : runAutopilotStrategy(workspaceId);
        }
        case JOB.autopilotDrafts: {
          const { workspaceId, strategyId } = jobPayload[JOB.autopilotDrafts].parse(job.data);
          const { runAutopilotDrafts } = await import("@/lib/agents/autopilot");
          return runAutopilotDrafts(workspaceId, strategyId);
        }
        default:
          throw new Error(`Unknown job "${job.name}"`);
      }
    },
    { connection: redisConnectionOptions(), concurrency: Number(process.env.WORKER_CONCURRENCY || 4) },
  );

  worker.on("completed", (job, result) => {
    const r = result as { status?: string; attempted?: number } | undefined;
    if (job.name === JOB.publicationAttempt) log("info", "publication.attempt", { jobId: job.id, status: r?.status });
    else if (r?.attempted) log("info", "maintenance.sweep", { attempted: r.attempted });
  });
  worker.on("failed", (job, err) => log("error", "job.failed", { job: job?.name, jobId: job?.id, attempts: job?.attemptsMade, error: err.message }));
  worker.on("error", (err) => log("error", "worker.error", { error: err.message }));

  // The sweep runs on a schedule owned by Redis, so several worker replicas
  // still produce one sweep per interval.
  const queue = await getQueue();
  await queue.upsertJobScheduler("maintenance-sweep", { every: intervalMs }, { name: JOB.maintenanceSweep, data: {} });

  log("info", "worker.started", { mode: "queue", queue: QUEUE_NAME, sweepEveryMs: intervalMs });

  const shutdown = async (signal: string) => {
    log("info", "worker.stopping", { signal });
    await worker.close(); // waits for the in-flight job
    await queue.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

function runHttpTickFallback(): void {
  const base = (process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const secret = process.env.WORKER_SECRET || "banyan-worker-dev-secret";

  async function tick(): Promise<void> {
    try {
      const res = await fetch(`${base}/api/worker/tick`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
      const body = (await res.json().catch(() => ({}))) as { attempted?: number; published?: number; failed?: number; error?: string };
      if (!res.ok) return log("error", "tick.failed", { status: res.status, error: body.error });
      if (body.attempted) log("info", "tick", { attempted: body.attempted, published: body.published, failed: body.failed });
    } catch (err) {
      log("error", "tick.unreachable", { base, error: (err as Error).message });
    }
  }

  log("info", "worker.started", { mode: "http-tick", base, everyMs: intervalMs });
  void tick();
  setInterval(() => void tick(), intervalMs);
}

function log(level: "info" | "error", event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), service: "worker", event, ...fields });
  (level === "error" ? console.error : console.log)(line);
}

if (process.env.REDIS_URL) {
  runQueueWorker().catch((err) => {
    log("error", "worker.crashed", { error: (err as Error).message });
    process.exit(1);
  });
} else {
  runHttpTickFallback();
}
