import { NextRequest } from "next/server";
import { apiError, assertSameOrigin, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { policyInput, describePolicy } from "@/lib/autonomy/policy";
import { getPolicy, setPolicy } from "@/lib/autonomy/service";

/** The workspace's supervised-autonomy policy. Only a person can change it. */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const policy = await getPolicy(ctx.workspace.id);
  return json({ policy, summary: describePolicy(policy) });
}

export async function PUT(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "approve");
  if (forbidden) return apiError(forbidden, 403);
  const parsed = await readJson(req, policyInput);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  if (parsed.data.level === "supervised" && parsed.data.channels.length === 0) {
    return apiError("Choose at least one channel Banyan may run under supervision.", 400);
  }
  const policy = await setPolicy(ctx.workspace.id, { id: ctx.user.id, name: ctx.user.name }, parsed.data);
  return json({ policy, summary: describePolicy(policy) });
}
