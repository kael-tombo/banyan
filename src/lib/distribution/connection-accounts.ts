import { prisma } from "@/lib/db";
import { credentialsFromConnection, providerFor } from "@/lib/distribution/providers";
import type { DistributionAccount, DistributionProvider, ProviderContext } from "@/lib/distribution/types";

/**
 * US-032 — the platform accounts behind a Banyan channel connection.
 *
 * A ChannelConnection holds Banyan's credentials for a distribution provider
 * (for SocialFlow: the workspace's API key). The LinkedIn or X account itself
 * is connected *at the provider*, which keeps the platform token: Banyan
 * never stores it. These helpers scope every account operation to one
 * connection of one workspace, and to that connection's channel.
 */

export type ConnectionScope = {
  connection: { id: string; channel: string; label: string; adapter: string };
  provider: DistributionProvider;
  ctx: ProviderContext;
};

export type ScopeError = { error: string; status: number };

export async function loadConnectionScope(workspaceId: string, connectionId: string): Promise<ConnectionScope | ScopeError> {
  const connection = await prisma.channelConnection.findFirst({ where: { id: connectionId, workspaceId } });
  if (!connection) return { error: "Connection not found.", status: 404 };
  const provider = connection.status === "removed" ? null : providerFor(connection.adapter);
  if (!provider) {
    return { error: `The "${connection.adapter}" provider is not available on this deployment.`, status: 400 };
  }
  return {
    connection: { id: connection.id, channel: connection.channel, label: connection.label, adapter: connection.adapter },
    provider,
    ctx: { workspaceId, credentials: credentialsFromConnection(connection) },
  };
}

export function isScopeError(v: ConnectionScope | ScopeError): v is ScopeError {
  return "error" in v;
}

/** Accounts at the provider for this connection's channel only. */
export function accountsForChannel(accounts: DistributionAccount[], channel: string): DistributionAccount[] {
  return accounts.filter((a) => a.platform === channel);
}

/** A connect URL is sent to the browser; only http(s) may pass (never javascript: or data:). */
export function safeConnectUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
