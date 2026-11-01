import { prisma } from "@/lib/db";
import { apiError, json, requireWorkspace } from "@/lib/api-utils";
import { strategyView } from "@/lib/strategy/service";

/** One strategy version, scoped to the caller's workspace. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const s = await prisma.strategy.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!s) return apiError("Not found.", 404);
  return json({ strategy: await strategyView(s) });
}
