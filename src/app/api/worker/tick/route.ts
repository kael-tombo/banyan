import { env } from "@/lib/env";
import { runMaintenanceSweep } from "@/lib/maintenance";
import { tickAuthorized } from "@/lib/worker-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Maintenance tick endpoint. Protected by WORKER_SECRET (or CRON_SECRET for Vercel Cron).
 *
 * With Docker Compose the worker runs the same sweep itself as a repeatable
 * queue job, so this endpoint is only needed when there is no queue: the
 * worker's HTTP fallback (`REDIS_URL` unset) or an external scheduler (cron,
 * a platform job) POSTing here. On Vercel, where no worker runs, Vercel Cron
 * calls it with GET. See src/lib/maintenance.ts for what it does.
 */
export const dynamic = "force-dynamic";
// The sweep can take a while on a busy workspace; 60 s is the most every Vercel plan allows.
export const maxDuration = 60;

async function tick(req: NextRequest) {
  if (!tickAuthorized(req.headers.get("authorization"), { workerSecret: env.WORKER_SECRET, cronSecret: process.env.CRON_SECRET })) {
    return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
  }
  const result = await runMaintenanceSweep();
  return NextResponse.json({ ok: true, ...result });
}

export const POST = tick;
export const GET = tick;
