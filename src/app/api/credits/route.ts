import { apiError, json, requireWorkspace } from "@/lib/api-utils";
import { getBalance } from "@/lib/credits/service";

/** GET /api/credits: available and held credits (US-063). */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  return json(await getBalance(ctx.workspace.id));
}
