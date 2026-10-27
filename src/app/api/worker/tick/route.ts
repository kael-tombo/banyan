import { env } from "@/lib/env";
import { processDueSchedule } from "@/lib/publishing/publish";
import { NextRequest, NextResponse } from "next/server";

/**
 * Publishing worker tick endpoint. Protected by WORKER_SECRET.
 * Triggered by `npm run worker` (in-process loop) or by your scheduler of
 * choice (cron, Railway job, GitHub Action) POSTing here.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.WORKER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
  }
  const result = await processDueSchedule();
  return NextResponse.json({ ok: true, ...result });
}
