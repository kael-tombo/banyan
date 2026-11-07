/**
 * Exit when the process's own output pipe is gone.
 *
 * A Next server whose stdout/stderr reader disappears (the terminal or tool that started it closed without
 * stopping it) hits EPIPE on its next log line. Nothing listens for that stream error, so it becomes an
 * uncaughtException; Next's handler logs it with console.error, which source-maps the stack and writes to the
 * same dead pipe, raising EPIPE again. The loop pins a CPU core, never yields to accept connections, and keeps
 * the port: on 2026-11-07 an orphaned dev server held Banyan's preview port this way for a day.
 *
 * With this guard the orphan exits instead, freeing the port for the next server. Only the process's own
 * stdout/stderr are watched; EPIPE on a client or database socket is untouched. Nothing is logged on the way
 * out, because there is nowhere left to log to.
 */

type ErrorStream = { on(event: "error", listener: (err: NodeJS.ErrnoException) => void): unknown };

const PIPE_GONE = new Set(["EPIPE", "ERR_STREAM_DESTROYED", "ECONNRESET"]);

export function isPipeGone(err: { code?: string } | null | undefined): boolean {
  return Boolean(err?.code && PIPE_GONE.has(err.code));
}

export function installBrokenPipeGuard(
  streams: { stdout: ErrorStream; stderr: ErrorStream },
  exit: (code: number) => void,
): void {
  let exiting = false;
  const onError = (err: NodeJS.ErrnoException) => {
    if (!isPipeGone(err) || exiting) return;
    exiting = true;
    exit(0);
  };
  streams.stdout.on("error", onError);
  streams.stderr.on("error", onError);
}
