/**
 * Next.js instrumentation hook: runs once when a server instance starts.
 * See src/lib/runtime/broken-pipe-guard.ts for why an orphaned server must exit.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installBrokenPipeGuard } = await import("@/lib/runtime/broken-pipe-guard");
  installBrokenPipeGuard({ stdout: process.stdout, stderr: process.stderr }, (code) => process.exit(code));
}
