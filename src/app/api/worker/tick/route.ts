import { env } from "@/lib/env";
import { processDueSchedule } from "@/lib/publishing/publish";
import { advanceWorkspace } from "@/lib/agents/orchestrator";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

/**
 * Background worker tick endpoint. Protected by WORKER_SECRET.
 * Triggered by `npm run worker` (in-process loop) or by your scheduler of
 * choice (cron, Railway job, GitHub Action) POSTing here.
 *
 * Two duties, in order:
 *  1. Attempt every due scheduled publication (bounded provider retry logic
 *     lives in the publishing workflow).
 *  2. Advance agent workflows for workspaces with active goals — recovering
 *     crashed leases, retrying transient failures and running the next safe
 *     batch of tasks. This is what makes workflows resume unattended.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.WORKER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
  }
  const publishResult = await processDueSchedule();

  let workflows: { workspaces: number; completed: number; failed: number; blocked: number } | null = null;
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
    workflows = { workspaces: memberships.length, completed, failed, blocked };
  } catch (err) {
    return NextResponse.json({ ok: true, ...publishResult, workflows: null, workflowError: (err as Error).message });
  }

  return NextResponse.json({ ok: true, ...publishResult, workflows });
}
