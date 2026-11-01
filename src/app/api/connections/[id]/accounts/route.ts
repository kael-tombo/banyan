import { NextRequest } from "next/server";
import { apiError, assertSameOrigin, json, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { recordActivity } from "@/lib/activity";
import { accountsForChannel, isScopeError, loadConnectionScope, safeConnectUrl } from "@/lib/distribution/connection-accounts";

/** US-032: the platform accounts connected at the provider for this channel connection. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const scope = await loadConnectionScope(ctx.workspace.id, (await params).id);
  if (isScopeError(scope)) return apiError(scope.error, scope.status);

  const res = await scope.provider.listAccounts(scope.ctx);
  if (!res.ok) return apiError(`Could not list accounts: ${res.error.message}`, 502);
  return json({ channel: scope.connection.channel, accounts: accountsForChannel(res.value, scope.connection.channel) });
}

/** US-032: start connecting a LinkedIn or X account; the browser is sent to the returned URL. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "manage");
  if (forbidden) return apiError(forbidden, 403);
  const scope = await loadConnectionScope(ctx.workspace.id, (await params).id);
  if (isScopeError(scope)) return apiError(scope.error, scope.status);

  const res = await scope.provider.connectAccount(scope.ctx, scope.connection.channel);
  if (!res.ok) return apiError(`Could not start connecting ${scope.connection.channel}: ${res.error.message}`, 502);
  const connectUrl = safeConnectUrl(res.value.connectUrl);
  if (!connectUrl) return apiError("The provider returned an unusable connect link.", 502);

  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "connection",
    summary: `Started connecting a ${scope.connection.channel} account through ${scope.provider.label}.`,
    meta: { connectionId: scope.connection.id },
  });
  return json({ connectUrl });
}
