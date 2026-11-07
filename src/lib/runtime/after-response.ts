import { after } from "next/server";

/**
 * Finish work after the response without losing it on serverless hosts.
 *
 * On Vercel a function can be frozen as soon as its response is sent, so a bare `void task` (the autopilot's
 * strategist, a background email) may stop halfway. `after()` keeps the invocation alive until the task settles.
 * Outside a request (the queue worker, scripts) `after()` throws; there the process outlives the task anyway, so it
 * simply runs. Errors are swallowed here: callers record their own outcome.
 */
export function finishAfterResponse(task: Promise<unknown>): void {
  const settled = task.then(
    () => undefined,
    () => undefined,
  );
  try {
    after(settled);
  } catch {
    // Not in a request scope: nothing to extend.
  }
}
