import { env } from "@/lib/env";
import { runMaintenanceSweep } from "@/lib/maintenance";
import { NextRequest, NextResponse } from "next/server";

/**
 * Maintenance tick endpoint. Protected by WORKER_SECRET.
 *
 * With Docker Compose the worker runs the same sweep itself as a repeatable
 * queue job, so this endpoint is only needed when there is no queue: the
 * worker's HTTP fallback (`REDIS_URL` unset) or an external scheduler (cron,
 * a platform job) POSTing here. See src/lib/maintenance.ts for what it does.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.WORKER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
  }
  const result = await runMaintenanceSweep();
  return NextResponse.json({ ok: true, ...result });
}
