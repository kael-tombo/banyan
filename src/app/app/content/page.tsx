import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { LinkButton, PageHeader, EmptyState, StatusBadge, Badge } from "@/components/ui";
import { PenLine, Plus } from "lucide-react";
import { ContentSearch } from "./search";
import Link from "next/link";

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; channel?: string; campaignId?: string }> }) {
  const { q, status, channel, campaignId } = await searchParams;
  const ctx = await requireWorkspaceServer();

  const items = await prisma.contentItem.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      ...(status ? { status } : {}),
      ...(channel ? { channel } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { body: { contains: q } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { campaign: { select: { name: true } } },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Content library"
        description="Search, filter, and edit everything drafted. Revisions are preserved — every manual edit and every AI regeneration is stored in the history."
        actions={<LinkButton href="/app/content/new"><Plus size={16} aria-hidden="true" /> New content</LinkButton>}
      />
      <ContentSearch />

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={q ? "No content matches your search" : "No content drafts yet"}
            body={q
              ? "Try a different term, or clear the filters."
              : "Draft your first item in the studio: pick a channel and format, generate in your brand voice, then save, edit, and submit for approval."}
            action={!q && <LinkButton href="/app/content/new" variant="secondary" size="sm"><PenLine size={14} aria-hidden="true" /> Draft content</LinkButton>}
            icon={q ? undefined : <PenLine size={22} className="text-forest" />}
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((i) => (
            <Link key={i.id} href={`/app/content/${i.id}`} className="card-lift block rounded-lg border border-bark/15 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-forest-deep">{i.title}</h2>
                <div className="flex items-center gap-2">
                  <Badge variant="charcoal">{i.channel === "shortvideo" ? "video" : i.channel}</Badge>
                  <StatusBadge status={i.status} />
                </div>
              </div>
              <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-charcoal-soft">{i.body}</p>
              <p className="mt-2 text-xs text-charcoal-soft">
                {i.campaign?.name ? `${i.campaign.name} · ` : i.campaign ? "" : "no campaign · "}
                {i.format} · updated {i.updatedAt.toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
