import { prisma } from "@/lib/db";
import { processDueSchedule } from "@/lib/publishing/publish";
import { advanceWorkspace } from "@/lib/agents/orchestrator";
import { backfillPublishedUrls } from "@/lib/publishing/status-sync";

/**
 * The maintenance sweep: everything that must happen periodically, whether
 * or not the job queue delivered it.
 *
 *  1. Attempt every due scheduled publication (safety net for lost or
 *     never-enqueued jobs; the atomic claim prevents double delivery).
 *  1b. Fill in live URLs for confirmed posts that came back without one (BOS-027).
 *  2. Advance agent workflows — recover crashed leases, retry transient
 *     failures, run the next safe batch of tasks.
 *
 * Shared by the worker (as a repeatable queue job) and POST /api/worker/tick
 * (for external schedulers), so the two can never drift apart.
 */
export async function runMaintenanceSweep(): Promise<{
  attempted: number;
  published: number;
  failed: number;
  workflows: { workspaces: number; completed: number; failed: number; blocked: number } | null;
  workflowError?: string;
  urls?: { checked: number; filled: number };
}> {
  const publishResult = { ...(await processDueSchedule()), urls: await backfillPublishedUrls().catch(() => undefined) };
  try {
    const memberships = await prisma.membership.findMany({ select: { workspaceId: true }, distinct: ["workspaceId"] });
    let completed = 0;
    let failed = 0;
    let blocked = 0;
    for (const m of memberships) {
      const report = await advanceWorkspace(m.workspaceId, { maxTasks: 4 });
      completed += report.completed;
      failed += report.failed;
      blocked += report.blocked;
    }
    return { ...publishResult, workflows: { workspaces: memberships.length, completed, failed, blocked } };
  } catch (err) {
    return { ...publishResult, workflows: null, workflowError: (err as Error).message };
  }
}
