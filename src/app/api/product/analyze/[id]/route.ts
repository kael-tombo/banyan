import { apiError, json, requireWorkspace } from "@/lib/api-utils";
import { getAnalysis } from "@/lib/product/analysis-runner";

/** Poll an analysis (US-021). Another workspace's analysis is a 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const { id } = await params;
  const analysis = await getAnalysis(ctx.workspace.id, id);
  if (!analysis) return apiError("Analysis not found.", 404);
  return json({ analysis });
}
