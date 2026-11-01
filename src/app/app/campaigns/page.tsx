import { isLifecycle, LIFECYCLE_LABEL } from "@/lib/campaign/lifecycle";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { LinkButton, PageHeader, EmptyState, StatusBadge, Badge } from "@/components/ui";
import { Megaphone, Plus } from "lucide-react";
import { CampaignFilters } from "./filters";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status, q } = await searchParams;
  const ctx = await requireWorkspaceServer();

  const where = {
    workspaceId: ctx.workspace.id,
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ name: { contains: q } }, { keyMessage: { contains: q } }, { objective: { contains: q } }] } : {}),
  };

  const [campaigns, counts] = await Promise.all([
    prisma.campaign.findMany({ where, orderBy: { updatedAt: "desc" }, include: { _count: { select: { items: true } } } }),
    prisma.campaign.groupBy({ by: ["status"], where: { workspaceId: ctx.workspace.id }, _count: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="A campaign carries one message to one audience through chosen channels, with a declared success metric."
        actions={<LinkButton href="/app/campaigns/new"><Plus size={16} aria-hidden="true" /> New campaign</LinkButton>}
      />
      <CampaignFilters counts={counts.map((c) => ({ status: c.status, count: c._count }))} />
      {campaigns.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={status ? `No ${status.replace(/_/g, " ")} campaigns` : "No campaigns yet"}
            body="Create a campaign to give content a purpose: one message, one audience, one success metric. You can start from your reviewed onboarding plan themes."
            action={<LinkButton href="/app/campaigns/new" variant="secondary"><Plus size={16} aria-hidden="true" /> Create your first campaign</LinkButton>}
            icon={<Megaphone size={22} className="text-forest" />}
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {campaigns.map((c) => (
            <a key={c.id} href={`/app/campaigns/${c.id}`} className="card-lift block rounded-lg border border-bark/15 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-forest-deep">{c.name}</h2>
                <div className="flex items-center gap-2">
                  <Badge variant="charcoal">{c._count.items} item{c._count.items === 1 ? "" : "s"}</Badge>
                  <Badge variant={c.lifecycle === "partially_failed" || c.lifecycle === "failed" ? "clay" : c.lifecycle === "paused" ? "warm" : "sage"}>
                    {isLifecycle(c.lifecycle) ? LIFECYCLE_LABEL[c.lifecycle] : c.status}
                  </Badge>
                </div>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-charcoal-soft">{c.keyMessage}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-charcoal-soft">
                <span>{JSON.parse(c.channels).join(" · ")}</span>
                <span aria-hidden="true">·</span>
                <span>Success metric: {c.successMetric}</span>
                <span aria-hidden="true">·</span>
                <span>updated {c.updatedAt.toLocaleDateString()}</span>
              </p>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
