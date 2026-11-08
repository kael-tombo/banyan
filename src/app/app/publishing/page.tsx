import { postLabel } from "@/lib/formats";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader, Card, Badge } from "@/components/ui";
import { PublicationState } from "@/components/PublicationState";
import { CHANNEL_META, CHANNELS, isChannel } from "@/lib/formats";
import { ConnectionManager } from "./connections";
import { enabledProviderIds, providerFor } from "@/lib/distribution/providers";

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
      include: { contentItem: { select: { id: true, title: true, channel: true, format: true } } },
    }),
    prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } }),
  ]);

  const selected = (JSON.parse(profile?.channels || "[]") as string[]).filter(isChannel);
  // Three honest states: verified and enabled, configured but not yet live-tested, or not set up.
  const socialflow: { state: "available" | "verifying" | "off"; label: string } = enabledProviderIds().includes("socialflow")
    ? { state: "available", label: "available" }
    : process.env.SOCIALFLOW_API_URL
      ? { state: "verifying", label: "awaiting live test" }
      : { state: "off", label: "not set up" };

  return (
    <>
      <PageHeader
        title="Publishing"
        description="Where approved posts go live. Nothing publishes without your approval, and a post counts as published only when SocialFlow confirms it or you record its live link."
      />

      <ConnectionManager
        providers={enabledProviderIds().map((id) => ({ id, label: providerFor(id)?.label ?? id }))}
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

      {/* How each channel goes out today: one row per channel, one status per row, read at a glance. */}
      <Card className="mt-6">
        <h2 className="font-medium text-charcoal">How each channel goes out</h2>
        <p className="mt-1 text-[13px] text-charcoal-soft">
          {socialflow.state === "available"
            ? "SocialFlow is verified here: approved LinkedIn and X posts publish to your connected accounts."
            : socialflow.state === "verifying"
              ? "SocialFlow is set up and waiting on its live test with real accounts. Until it passes, posts go out by export."
              : "SocialFlow isn't set up on this deployment, so posts go out by export: you publish, then record the live link."}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-bark/10 text-left text-[13px] text-muted">
                <th className="py-2 pr-4 font-normal">Channel</th>
                <th className="py-2 pr-4 font-normal">In your strategy</th>
                <th className="py-2 font-normal">How it goes out today</th>
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((channel) => {
                const auto = channel !== "shortvideo" && socialflow.state === "available";
                const how =
                  channel === "shortvideo"
                    ? "Script and manual handoff: you record and post it"
                    : auto
                      ? "Published through SocialFlow, confirmed on read-back"
                      : "Export: you publish it, then record the live link";
                return (
                  <tr key={channel} className="border-b border-bark/[0.06] last:border-0">
                    <td className="py-3 pr-4 font-medium text-charcoal">{CHANNEL_META[channel].label}</td>
                    <td className="py-3 pr-4 text-charcoal-soft">{selected.includes(channel) ? "Yes" : "No"}</td>
                    <td className="py-3 text-charcoal-soft">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${auto ? "bg-forest" : "bg-bark/40"}`} aria-hidden="true" />
                        {how}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 border-t border-bark/10 pt-3 text-[13px] text-muted">
          Export and manual recording always work: a link you record is stored as a manual publication, never as a
          provider confirmation.
        </p>
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
                  {postLabel(p.contentItem).name}
                </Link>
                <span className="flex items-center gap-2">
                  <Badge variant="charcoal">{p.manual ? "manual" : p.provider}</Badge>
                  <PublicationState publication={p} compact />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
