import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader, Card, Badge, StatusBadge } from "@/components/ui";
import { CHANNEL_META, CHANNELS, isChannel } from "@/lib/formats";
import { ConnectionManager } from "./connections";

export const metadata: Metadata = { title: "Publishing" };

export default async function PublishingPage() {
  const ctx = await requireWorkspaceServer();

  const [connections, publications, profile] = await Promise.all([
    prisma.channelConnection.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.publication.findMany({
      where: { contentItem: { workspaceId: ctx.workspace.id } },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { contentItem: { select: { id: true, title: true, channel: true } } },
    }),
    prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } }),
  ]);

  const selected = (JSON.parse(profile?.channels || "[]") as string[]).filter(isChannel);

  return (
    <>
      <PageHeader
        title="Publishing"
        description="Connect a real provider to publish X and LinkedIn. Content only publishes after human approval, and a publication is recorded as confirmed only when the provider confirms it."
      />

      <ConnectionManager
        initial={connections.map((c) => ({
          id: c.id,
          channel: c.channel,
          adapter: c.adapter,
          label: c.label,
          status: c.status,
          lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null,
          lastError: c.lastError,
        }))}
      />

      <Card className="mt-6">
        <h2 className="mb-3 font-medium text-charcoal">Channel capabilities</h2>
        <ul className="space-y-3 text-sm">
          {CHANNELS.map((channel) => (
            <li key={channel} className="flex flex-wrap items-start justify-between gap-2">
              <span className="max-w-xl">
                <span className="block font-medium text-charcoal">{CHANNEL_META[channel].label}</span>
                <span className="block text-charcoal-soft">{CHANNEL_META[channel].capability}</span>
              </span>
              <span className="flex items-center gap-2">
                {selected.includes(channel) ? (
                  <Badge variant="forest">selected</Badge>
                ) : (
                  <Badge variant="warm">not selected</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 font-medium text-charcoal">Connector status</h2>
        <ul className="space-y-2 text-sm">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="block font-medium text-charcoal">Postiz</span>
              <span className="block text-charcoal-soft">Verified against the Postiz public API (list integrations, create posts, schedule). Self-hosted or cloud.</span>
            </span>
            <Badge variant="forest">available now</Badge>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="block font-medium text-charcoal">SocialFlow.ai</span>
              <span className="block text-charcoal-soft">
                An adapter slot (<code>socialflow</code>) exists in the publishing registry behind the same
                typed <code>PublishingAdapter</code> interface. Not enabled — we will wire it once its API
                documentation is verified and credentials are available. We do not ship connectors we cannot test.
              </span>
            </span>
            <Badge variant="warm">planned</Badge>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="block font-medium text-charcoal">Manual recording</span>
              <span className="block text-charcoal-soft">Publish anything yourself (natively, from any tool), then record the live URL as a user-confirmed manual publication.</span>
            </span>
            <Badge variant="moss">always available</Badge>
          </li>
        </ul>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 font-medium text-charcoal">Recent publication attempts</h2>
        {publications.length === 0 ? (
          <p className="text-sm text-charcoal-soft">
            Nothing has been published or attempted yet. Approve an item, then publish or schedule it from the content editor.
          </p>
        ) : (
          <ul className="space-y-2">
            {publications.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href={`/app/content/${p.contentItem.id}`} className="truncate text-charcoal hover:text-forest">
                  {p.contentItem.title}
                </Link>
                <span className="flex items-center gap-2">
                  <Badge variant="charcoal">{p.manual ? "manual" : p.provider}</Badge>
                  <StatusBadge status={p.status} />
                  {p.externalUrl && (
                    <a href={p.externalUrl} target="_blank" rel="noreferrer noopener" className="text-xs text-forest underline">
                      view
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
