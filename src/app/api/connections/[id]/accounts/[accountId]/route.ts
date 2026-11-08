import { NextRequest } from "next/server";
import { apiError, assertSameOrigin, json, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { recordActivity } from "@/lib/activity";
import { accountsForChannel, isScopeError, loadConnectionScope } from "@/lib/distribution/connection-accounts";

/** US-032: disconnect one platform account; the provider destroys its token. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; accountId: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "manage");
  if (forbidden) return apiError(forbidden, 403);
  const { id, accountId } = await params;
  const scope = await loadConnectionScope(ctx.workspace.id, id);
  if (isScopeError(scope)) return apiError(scope.error, scope.status);

  // Only an account of this connection's channel, as the provider reports it.
  const list = await scope.provider.listAccounts(scope.ctx);
  if (!list.ok) return apiError(`Could not reach ${scope.provider.label}: ${list.error.message}`, 502);
  const account = accountsForChannel(list.value, scope.connection.channel).find((a) => a.id === accountId);
  if (!account) return apiError("Account not found for this connection.", 404);

  const res = await scope.provider.revokeAccount(scope.ctx, account.id);
  if (!res.ok) return apiError(`Could not disconnect ${account.handle}: ${res.error.message}`, 502);

  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "connection",
    summary: `Disconnected ${scope.connection.channel} account ${account.handle}${res.value.platformConfirmed ? "" : " (the platform did not confirm the revocation; remove the app in its settings to be sure)"}.`,
    meta: { connectionId: scope.connection.id, accountId: account.id, platformConfirmed: res.value.platformConfirmed },
  });
  return json({ ok: true, platformConfirmed: res.value.platformConfirmed });
}
